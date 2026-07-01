import type { EnvBindings } from "../../../lib/app-env";
import { AppError, NotFoundError } from "../../../lib/errors";
import type { StudentRole } from "../../students/contracts";
import { institutionsRepository } from "../../institutions/repository";
import { rewardsService } from "../../rewards/services";
import { reviewService } from "../../review/services";
import { staffAuthRepository } from "../../staff-auth/repository";
import { staffAuthService } from "../../staff-auth/services";
import {
  adminAnalyticsRepository,
  adminInstitutionsRepository,
  adminPapersRepository,
  adminReviewRepository,
  adminStaffUsersRepository,
  adminUsersRepository,
  adminWaitlistRepository
} from "../repository";

const allowedAdminRoles: StudentRole[] = ["student", "reviewer", "admin"];

export const adminService = {
  listInstitutions: async (db: D1Database) => {
    return await adminInstitutionsRepository.list(db);
  },
  listUsers: async (db: D1Database) => {
    return await adminUsersRepository.list(db);
  },
  listStaffUsers: async (db: D1Database) => {
    return await adminStaffUsersRepository.list(db);
  },
  deactivateStaffUser: async (
    db: D1Database,
    input: {
      staffUserId: string;
      actorStaffUserId: string;
    }
  ) => {
    const existingUser = await adminStaffUsersRepository.findById(db, input.staffUserId);

    if (!existingUser) {
      throw new NotFoundError("Staff user was not found.");
    }

    if (existingUser.role !== "reviewer") {
      throw new AppError("Only reviewer accounts can be deactivated.", 400);
    }

    if (existingUser.id === input.actorStaffUserId) {
      throw new AppError("You cannot deactivate your own staff account.", 400);
    }

    const updatedUser = await adminStaffUsersRepository.deactivate(db, existingUser.id);

    if (!updatedUser) {
      throw new AppError("Failed to deactivate staff user.", 500);
    }

    return updatedUser;
  },
  deleteStaffUser: async (
    db: D1Database,
    input: {
      staffUserId: string;
      actorStaffUserId: string;
    }
  ) => {
    const existingUser = await adminStaffUsersRepository.findById(db, input.staffUserId);

    if (!existingUser) {
      throw new NotFoundError("Staff user was not found.");
    }

    if (existingUser.role !== "reviewer") {
      throw new AppError("Only reviewer accounts can be deleted.", 400);
    }

    if (existingUser.id === input.actorStaffUserId) {
      throw new AppError("You cannot delete your own staff account.", 400);
    }

    const invites = await adminStaffUsersRepository.listInvitesForUser(db, {
      institutionId: existingUser.institutionId,
      email: existingUser.email
    });

    for (const invite of invites) {
      await staffAuthRepository.deleteInvite(db, invite.id);
    }

    await adminStaffUsersRepository.delete(db, existingUser.id);
  },
  updateUserRole: async (db: D1Database, studentId: string, role: string) => {
    if (!allowedAdminRoles.includes(role as StudentRole)) {
      throw new AppError("Role must be student, reviewer, or admin.", 400);
    }

    const existingUser = await adminUsersRepository.findById(db, studentId);

    if (!existingUser) {
      throw new NotFoundError("Student was not found.");
    }

    const updatedUser = await adminUsersRepository.updateRole(db, studentId, role as StudentRole);

    if (!updatedUser) {
      throw new AppError("Failed to update student role.", 500);
    }

    return updatedUser;
  },
  listReviewQueue: async (db: D1Database) => {
    return await adminReviewRepository.queue(db);
  },
  approveSubmission: async (
    db: D1Database,
    env: EnvBindings,
    uploadSubmissionId: string,
    reviewerStudentId: string | null,
    notes: string | null
  ) => {
    return await reviewService.approveSubmission(
      db,
      env,
      {
        institutionId: null,
        staffRole: "admin"
      },
      uploadSubmissionId,
      reviewerStudentId,
      notes
    );
  },
  getSubmission: async (db: D1Database, uploadSubmissionId: string) => {
    return await reviewService.getSubmission(
      db,
      {
        institutionId: null,
        staffRole: "admin"
      },
      uploadSubmissionId
    );
  },
  getSubmissionFile: async (db: D1Database, env: EnvBindings, uploadSubmissionId: string) => {
    return await reviewService.getSubmissionFile(
      db,
      env,
      {
        institutionId: null,
        staffRole: "admin"
      },
      uploadSubmissionId
    );
  },
  rejectSubmission: async (
    db: D1Database,
    uploadSubmissionId: string,
    reviewerStudentId: string | null,
    notes: string | null
  ) => {
    return await reviewService.rejectSubmission(
      db,
      {
        institutionId: null,
        staffRole: "admin"
      },
      uploadSubmissionId,
      reviewerStudentId,
      notes
    );
  },
  holdSubmission: async (
    db: D1Database,
    uploadSubmissionId: string,
    reviewerStudentId: string | null,
    notes: string | null
  ) => {
    return await reviewService.holdSubmission(
      db,
      {
        institutionId: null,
        staffRole: "admin"
      },
      uploadSubmissionId,
      reviewerStudentId,
      notes
    );
  },
  listPapers: async (db: D1Database) => {
    return await adminPapersRepository.list(db);
  },
  getPaper: async (db: D1Database, paperId: string) => {
    return await reviewService.getPaper(
      db,
      {
        institutionId: null,
        staffRole: "admin"
      },
      paperId
    );
  },
  getPaperFile: async (db: D1Database, env: EnvBindings, paperId: string) => {
    return await reviewService.getPaperFile(
      db,
      env,
      {
        institutionId: null,
        staffRole: "admin"
      },
      paperId
    );
  },
  archivePaper: async (
    db: D1Database,
    paperId: string,
    reviewerStudentId: string | null,
    notes: string | null
  ) => {
    return await reviewService.archivePaper(
      db,
      {
        institutionId: null,
        staffRole: "admin"
      },
      paperId,
      reviewerStudentId,
      notes
    );
  },
  listWaitlist: async (db: D1Database) => {
    return await adminWaitlistRepository.list(db);
  },
  listPayments: async (db: D1Database) => {
    return await rewardsService.listAllCashouts(db);
  },
  getPayment: async (db: D1Database, paymentId: string) => {
    return await rewardsService.getCashoutRequest(db, paymentId);
  },
  approvePayment: async (db: D1Database, paymentId: string) => {
    return await rewardsService.approveCashoutRequest(db, paymentId);
  },
  markPaymentPaid: async (db: D1Database, paymentId: string) => {
    return await rewardsService.markCashoutPaid(db, paymentId);
  },
  getAnalyticsOverview: async (db: D1Database) => {
    return await adminAnalyticsRepository.overview(db);
  },
  inviteReviewer: async (
    db: D1Database,
    input: {
      institutionId: string;
      email: string;
      invitedByStaffUserId: string;
    },
    env: Pick<EnvBindings, "APP_ENV" | "RESEND_API_KEY" | "AUTH_EMAIL_FROM">
  ) => {
    const institution = await institutionsRepository.findById(db, input.institutionId);

    if (!institution) {
      throw new NotFoundError("Institution was not found.");
    }

    return await staffAuthService.createReviewerInvitation(
      db,
      {
        institutionId: institution.id,
        institutionName: institution.name,
        email: input.email,
        invitedByStaffUserId: input.invitedByStaffUserId
      },
      env
    );
  }
};
