import type { EnvBindings } from "../../../lib/app-env";
import { AppError, NotFoundError } from "../../../lib/errors";
import type { StudentRole } from "../../students/contracts";
import { institutionsRepository } from "../../institutions/repository";
import { reviewService } from "../../review/services";
import { staffAuthService } from "../../staff-auth/services";
import {
  adminAnalyticsRepository,
  adminInstitutionsRepository,
  adminPapersRepository,
  adminReviewRepository,
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
