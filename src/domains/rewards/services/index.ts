import {
  APPROVED_UPLOAD_REWARD_KES,
  CASHOUT_AMOUNT_KES,
  CASHOUT_UPLOAD_TARGET
} from "../../../lib/constants";
import { AppError, NotFoundError } from "../../../lib/errors";
import type { EnvBindings } from "../../../lib/app-env";
import { emailPlatform } from "../../../platform/email";
import { logger } from "../../../platform/observability";
import { institutionsRepository } from "../../institutions/repository";
import { staffAuthRepository } from "../../staff-auth/repository";
import { studentsRepository } from "../../students/repository";
import type { CashoutRequest, StudentRewardsSnapshot } from "../contracts";
import { rewardsRepository } from "../repository";

const countPendingCashouts = (cashoutRequests: CashoutRequest[]) => {
  return cashoutRequests.filter((request) => request.status === "requested" || request.status === "approved")
    .length;
};

const buildRewardsSnapshot = (
  studentId: string,
  institutionId: string,
  approvedUploads: number,
  cashoutRequests: CashoutRequest[]
): StudentRewardsSnapshot => {
  const activeCashoutRequests = cashoutRequests.filter((request) => request.status !== "cancelled");
  const readyCashoutCount = activeCashoutRequests.filter((request) => request.status === "ready").length;
  const consumedUploads = activeCashoutRequests.length * CASHOUT_UPLOAD_TARGET;
  const currentCycleApprovedUploads = Math.max(0, approvedUploads - consumedUploads);

  return {
    studentId,
    institutionId,
    progress: {
      approvedUploads,
      lifetimeEarnedKes: approvedUploads * APPROVED_UPLOAD_REWARD_KES,
      currentCycleApprovedUploads,
      currentCycleTargetUploads: CASHOUT_UPLOAD_TARGET,
      currentCycleEarnedKes: currentCycleApprovedUploads * APPROVED_UPLOAD_REWARD_KES,
      readyCashoutCount,
      pendingCashoutCount: countPendingCashouts(activeCashoutRequests),
      cashoutReady: readyCashoutCount > 0
    },
    cashoutRequests
  };
};

export const rewardsService = {
  syncCashoutMilestones: async (db: D1Database, input: { studentId: string; institutionId: string }) => {
    const approvedUploads = await rewardsRepository.countApprovedUploadsByStudent(db, input.studentId);
    const existingActiveCashoutCount = await rewardsRepository.countActiveCashoutRequestsByStudent(
      db,
      input.studentId
    );
    const requiredCashoutCount = Math.floor(approvedUploads / CASHOUT_UPLOAD_TARGET);
    const newlyCreatedCashoutRequests: CashoutRequest[] = [];

    for (let currentCount = existingActiveCashoutCount; currentCount < requiredCashoutCount; currentCount += 1) {
      const createdRequest = await rewardsRepository.create(db, {
        id: crypto.randomUUID(),
        institutionId: input.institutionId,
        studentId: input.studentId,
        approvedUploadCountSnapshot: (currentCount + 1) * CASHOUT_UPLOAD_TARGET,
        amountKes: CASHOUT_AMOUNT_KES,
        status: "ready"
      });

      if (!createdRequest) {
        throw new AppError("Failed to create a ready cashout request.", 500);
      }

      newlyCreatedCashoutRequests.push(createdRequest);
    }

    return newlyCreatedCashoutRequests;
  },
  getStudentRewards: async (db: D1Database, studentId: string) => {
    const student = await studentsRepository.findById(db, studentId);

    if (!student) {
      throw new NotFoundError("Authenticated student was not found.");
    }

    await rewardsService.syncCashoutMilestones(db, {
      studentId: student.id,
      institutionId: student.institutionId
    });

    const approvedUploads = await rewardsRepository.countApprovedUploadsByStudent(db, student.id);
    const cashoutRequests = await rewardsRepository.listByStudent(db, student.id);

    return {
      student,
      rewards: buildRewardsSnapshot(student.id, student.institutionId, approvedUploads, cashoutRequests)
    };
  },
  requestCashout: async (
    db: D1Database,
    input: {
      studentId: string;
      mpesaPhoneNumber: string;
    }
  ) => {
    const student = await studentsRepository.findById(db, input.studentId);

    if (!student) {
      throw new NotFoundError("Authenticated student was not found.");
    }

    await rewardsService.syncCashoutMilestones(db, {
      studentId: student.id,
      institutionId: student.institutionId
    });

    const readyCashoutRequest = await rewardsRepository.findOldestReadyByStudent(db, student.id);

    if (!readyCashoutRequest) {
      throw new AppError("No cashout is ready for this student yet.", 409);
    }

    const requestedCashout = await rewardsRepository.markRequested(db, {
      id: readyCashoutRequest.id,
      mpesaPhoneNumber: input.mpesaPhoneNumber
    });

    if (!requestedCashout) {
      throw new AppError("Failed to request cashout.", 500);
    }

    const approvedUploads = await rewardsRepository.countApprovedUploadsByStudent(db, student.id);
    const cashoutRequests = await rewardsRepository.listByStudent(db, student.id);

    return {
      student,
      cashoutRequest: requestedCashout,
      rewards: buildRewardsSnapshot(student.id, student.institutionId, approvedUploads, cashoutRequests)
    };
  },
  listInstitutionCashouts: async (db: D1Database, institutionId: string) => {
    return await rewardsRepository.listForInstitution(db, institutionId);
  },
  listAllCashouts: async (db: D1Database) => {
    return await rewardsRepository.listAll(db);
  },
  getCashoutRequest: async (db: D1Database, cashoutRequestId: string) => {
    const cashoutRequest = await rewardsRepository.findById(db, cashoutRequestId);

    if (!cashoutRequest) {
      throw new NotFoundError("Cashout request was not found.");
    }

    return cashoutRequest;
  },
  approveCashoutRequest: async (db: D1Database, cashoutRequestId: string) => {
    const cashoutRequest = await rewardsRepository.findById(db, cashoutRequestId);

    if (!cashoutRequest) {
      throw new NotFoundError("Cashout request was not found.");
    }

    if (cashoutRequest.status !== "requested") {
      throw new AppError("Only requested cashouts can be approved.", 400);
    }

    const approvedCashout = await rewardsRepository.markApproved(db, cashoutRequest.id);

    if (!approvedCashout) {
      throw new AppError("Failed to approve cashout request.", 500);
    }

    return approvedCashout;
  },
  markCashoutPaid: async (db: D1Database, cashoutRequestId: string) => {
    const cashoutRequest = await rewardsRepository.findById(db, cashoutRequestId);

    if (!cashoutRequest) {
      throw new NotFoundError("Cashout request was not found.");
    }

    if (cashoutRequest.status !== "approved") {
      throw new AppError("Only approved cashouts can be marked as paid.", 400);
    }

    const paidCashout = await rewardsRepository.markPaid(db, cashoutRequest.id);

    if (!paidCashout) {
      throw new AppError("Failed to mark cashout as paid.", 500);
    }

    return paidCashout;
  },
  sendApprovalProgressEmails: async (
    db: D1Database,
    env: Pick<EnvBindings, "APP_ENV" | "RESEND_API_KEY" | "AUTH_EMAIL_FROM">,
    input: {
      studentId: string;
      institutionId: string;
      title: string;
      unitCode: string;
      unitName: string;
      paperType: string;
    }
  ) => {
    const student = await studentsRepository.findById(db, input.studentId);
    const institution = await institutionsRepository.findById(db, input.institutionId);

    if (!student) {
      throw new NotFoundError("Student was not found for this approved upload.");
    }

    if (!institution) {
      throw new NotFoundError("Institution was not found for this approved upload.");
    }

    const newlyReadyCashoutRequests = await rewardsService.syncCashoutMilestones(db, {
      studentId: student.id,
      institutionId: student.institutionId
    });
    const approvedUploads = await rewardsRepository.countApprovedUploadsByStudent(db, student.id);
    const cashoutRequests = await rewardsRepository.listByStudent(db, student.id);
    const rewards = buildRewardsSnapshot(student.id, student.institutionId, approvedUploads, cashoutRequests);

    try {
      await emailPlatform.sendUploadApproved(env, {
        email: student.email,
        fullName: student.fullName,
        institutionName: institution.name,
        title: input.title,
        unitCode: input.unitCode,
        unitName: input.unitName,
        paperType: input.paperType,
        currentCycleApprovedUploads: rewards.progress.currentCycleApprovedUploads,
        currentCycleTargetUploads: rewards.progress.currentCycleTargetUploads,
        lifetimeEarnedKes: rewards.progress.lifetimeEarnedKes
      });
    } catch (error) {
      logger.error("Upload approval email failed", {
        institutionId: input.institutionId,
        studentId: input.studentId,
        email: student.email,
        error: error instanceof Error ? error.message : "unknown_error"
      });
    }

    if (newlyReadyCashoutRequests.length === 0) {
      return rewards;
    }

    try {
      await emailPlatform.sendCashoutUnlocked(env, {
        email: student.email,
        fullName: student.fullName,
        institutionName: institution.name,
        amountKes: newlyReadyCashoutRequests.length * CASHOUT_AMOUNT_KES,
        readyCashoutCount: rewards.progress.readyCashoutCount
      });
    } catch (error) {
      logger.error("Cashout unlocked email failed", {
        institutionId: input.institutionId,
        studentId: input.studentId,
        email: student.email,
        error: error instanceof Error ? error.message : "unknown_error"
      });
    }

    const recipients = await staffAuthRepository.listCashoutNotificationRecipients(
      db,
      input.institutionId
    );

    for (const recipient of recipients) {
      try {
        await emailPlatform.sendStaffCashoutReadyNotification(env, {
          email: recipient.email,
          institutionName: institution.name,
          studentFullName: student.fullName,
          studentEmail: student.email,
          readyCashoutCount: rewards.progress.readyCashoutCount,
          amountKes: newlyReadyCashoutRequests.length * CASHOUT_AMOUNT_KES
        });
      } catch (error) {
        logger.error("Staff cashout ready notification email failed", {
          institutionId: input.institutionId,
          studentId: input.studentId,
          recipientEmail: recipient.email,
          error: error instanceof Error ? error.message : "unknown_error"
        });
      }
    }

    return rewards;
  }
};
