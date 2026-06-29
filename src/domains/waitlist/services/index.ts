import { AppError } from "../../../lib/errors";
import { waitlistRepository } from "../repository";
import type { Student } from "../../students/contracts";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeName = (name: string) => name.trim();

export const waitlistService = {
  joinAuthenticatedStudent: async (db: D1Database, student: Student) => {
    const normalizedEmail = normalizeEmail(student.email);
    const existingEntry = await waitlistRepository.findByInstitutionAndEmail(
      db,
      student.institutionId,
      normalizedEmail
    );

    if (existingEntry) {
      throw new AppError("This email is already on the waitlist.", 409);
    }

    return waitlistRepository.create(db, {
      institutionId: student.institutionId,
      name: normalizeName(student.fullName),
      email: normalizedEmail
    });
  }
};
