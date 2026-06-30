import type { EnvBindings } from "../../../lib/app-env";
import { AppError } from "../../../lib/errors";
import { emailPlatform } from "../../../platform/email";
import { logger } from "../../../platform/observability";
import { institutionsRepository } from "../../institutions/repository";
import { waitlistRepository } from "../repository";
import type { Student } from "../../students/contracts";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeName = (name: string) => name.trim();

export const waitlistService = {
  joinAuthenticatedStudent: async (
    db: D1Database,
    student: Student,
    env: Pick<EnvBindings, "APP_ENV" | "RESEND_API_KEY" | "AUTH_EMAIL_FROM">
  ) => {
    const normalizedEmail = normalizeEmail(student.email);
    const existingEntry = await waitlistRepository.findByInstitutionAndEmail(
      db,
      student.institutionId,
      normalizedEmail
    );

    if (existingEntry) {
      throw new AppError("This email is already on the waitlist.", 409);
    }

    const institution = await institutionsRepository.findById(db, student.institutionId);

    if (!institution) {
      throw new AppError("Institution was not found for this waitlist entry.", 404);
    }

    const entry = await waitlistRepository.create(db, {
      institutionId: student.institutionId,
      name: normalizeName(student.fullName),
      email: normalizedEmail
    });

    try {
      await emailPlatform.sendWaitlistJoined(env, {
        email: normalizedEmail,
        fullName: normalizeName(student.fullName),
        institutionName: institution.name
      });
    } catch (error) {
      logger.error("Waitlist confirmation email failed", {
        institutionId: student.institutionId,
        studentId: student.id,
        email: normalizedEmail,
        error: error instanceof Error ? error.message : "unknown_error"
      });
    }

    return entry;
  }
};
