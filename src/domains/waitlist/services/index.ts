import { AppError, NotFoundError, UnauthorizedError } from "../../../lib/errors";
import { institutionsRepository } from "../../institutions/repository";
import { waitlistRepository } from "../repository";
import type { CreateWaitlistEntryInput } from "../contracts";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeName = (name: string) => name.trim();

const getEmailDomain = (email: string) => {
  const [, domain] = normalizeEmail(email).split("@");

  if (!domain) {
    throw new UnauthorizedError("A valid institutional email is required.");
  }

  return domain;
};

export const waitlistService = {
  join: async (db: D1Database, input: CreateWaitlistEntryInput) => {
    const institution = await institutionsRepository.findBySlug(db, input.institutionSlug);

    if (!institution) {
      throw new NotFoundError("Institution was not found.");
    }

    const normalizedEmail = normalizeEmail(input.email);

    if (getEmailDomain(normalizedEmail) !== institution.emailDomain) {
      throw new UnauthorizedError("The provided email domain is not allowed for this institution.");
    }

    const existingEntry = await waitlistRepository.findByInstitutionAndEmail(
      db,
      institution.id,
      normalizedEmail
    );

    if (existingEntry) {
      throw new AppError("This email is already on the waitlist.", 409);
    }

    return waitlistRepository.create(db, {
      institutionId: institution.id,
      name: normalizeName(input.name),
      email: normalizedEmail
    });
  }
};
