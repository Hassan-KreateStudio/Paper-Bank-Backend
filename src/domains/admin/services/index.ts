import type { EnvBindings } from "../../../lib/app-env";
import { AppError, NotFoundError } from "../../../lib/errors";
import type { StudentRole } from "../../students/contracts";
import { reviewService } from "../../review/services";
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
        studentRole: "admin"
      },
      uploadSubmissionId,
      reviewerStudentId,
      notes
    );
  },
  listPapers: async (db: D1Database) => {
    return await adminPapersRepository.list(db);
  },
  listWaitlist: async (db: D1Database) => {
    return await adminWaitlistRepository.list(db);
  },
  getAnalyticsOverview: async (db: D1Database) => {
    return await adminAnalyticsRepository.overview(db);
  }
};
