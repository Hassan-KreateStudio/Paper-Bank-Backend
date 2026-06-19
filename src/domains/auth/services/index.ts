import { institutionsRepository } from "../../institutions/repository";
import { studentsRepository } from "../../students/repository";
import { AppError, NotFoundError, UnauthorizedError } from "../../../lib/errors";
import { logger } from "../../../platform/observability";
import { authRepository } from "../repository";
import type {
  AuthChallenge,
  ChallengeCooldownState,
  CreateChallengeInput,
  VerifyChallengeInput
} from "../contracts";
import { createAuthToken } from "../token";

const CHALLENGE_TTL_MINUTES = 10;
const CHALLENGE_COOLDOWN_SECONDS = 60;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeFullName = (fullName: string) => fullName.trim();

const getEmailDomain = (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  const [, domain] = normalizedEmail.split("@");

  if (!domain) {
    throw new UnauthorizedError("A valid institutional email is required.");
  }

  return domain;
};

const hashVerificationCode = async (verificationCode: string) => {
  const input = new TextEncoder().encode(verificationCode);
  const digest = await crypto.subtle.digest("SHA-256", input);

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const generateVerificationCode = () => {
  return `${crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000}`.padStart(6, "0");
};

const createExpiry = () => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + CHALLENGE_TTL_MINUTES);
  return expiresAt.toISOString();
};

const isExpired = (expiresAt: string) => new Date(expiresAt).getTime() <= Date.now();

export const getChallengeCooldownState = (
  latestChallengeCreatedAt: string | null,
  now = Date.now()
): ChallengeCooldownState => {
  if (!latestChallengeCreatedAt) {
    return {
      allowed: true,
      retryAfterSeconds: 0
    };
  }

  const elapsedSeconds = Math.floor((now - new Date(latestChallengeCreatedAt).getTime()) / 1000);
  const remainingSeconds = CHALLENGE_COOLDOWN_SECONDS - elapsedSeconds;

  if (remainingSeconds > 0) {
    return {
      allowed: false,
      retryAfterSeconds: remainingSeconds
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0
  };
};

export const authService = {
  createChallenge: async (
    db: D1Database,
    input: CreateChallengeInput,
    options?: { now?: number }
  ) => {
    const normalizedEmail = normalizeEmail(input.email);
    const institution = await institutionsRepository.findByEmailDomain(db, getEmailDomain(normalizedEmail));

    if (!institution) {
      throw new UnauthorizedError("The provided email domain is not allowed.");
    }

    const existingStudentByAdmission = await studentsRepository.findByInstitutionAndAdmissionNumber(
      db,
      institution.id,
      input.admissionNumber
    );
    const existingStudentByEmail = await studentsRepository.findByInstitutionAndEmail(
      db,
      institution.id,
      normalizedEmail
    );

    if (
      existingStudentByAdmission &&
      normalizeEmail(existingStudentByAdmission.email) !== normalizedEmail
    ) {
      throw new UnauthorizedError("The provided student details could not be verified.");
    }

    if (existingStudentByEmail && existingStudentByEmail.admissionNumber !== input.admissionNumber) {
      throw new UnauthorizedError("The provided student details could not be verified.");
    }

    const latestPendingChallenge = await authRepository.findLatestPendingChallenge(
      db,
      institution.id,
      input.admissionNumber,
      normalizedEmail
    );
    const cooldownState = getChallengeCooldownState(
      latestPendingChallenge?.createdAt ?? null,
      options?.now
    );

    if (!cooldownState.allowed) {
      throw new AppError(
        `Please wait ${cooldownState.retryAfterSeconds} seconds before requesting another verification code.`,
        429
      );
    }

    const verificationCode = generateVerificationCode();
    const challenge: AuthChallenge = {
      id: crypto.randomUUID(),
      institutionId: institution.id,
      studentId: existingStudentByAdmission?.id ?? existingStudentByEmail?.id ?? null,
      admissionNumber: input.admissionNumber,
      email: normalizedEmail,
      fullName: normalizeFullName(input.fullName),
      verificationCodeHash: await hashVerificationCode(verificationCode),
      status: "pending",
      expiresAt: createExpiry(),
      consumedAt: null,
      createdAt: new Date().toISOString()
    };

    await authRepository.createChallenge(db, challenge);

    logger.info("Auth verification code generated", {
      challengeId: challenge.id,
      institutionId: institution.id,
      studentId: challenge.studentId,
      email: challenge.email,
      verificationCode
    });

    return {
      challengeId: challenge.id,
      message: "Verification challenge created.",
      expiresAt: challenge.expiresAt
    };
  },
  verifyChallenge: async (
    db: D1Database,
    input: VerifyChallengeInput,
    env: { AUTH_TOKEN_SECRET?: string }
  ) => {
    const challenge = await authRepository.findChallengeById(db, input.challengeId);

    if (!challenge) {
      throw new NotFoundError("Auth challenge was not found.");
    }

    if (challenge.status !== "pending") {
      throw new AppError("This auth challenge is no longer active.", 409);
    }

    if (isExpired(challenge.expiresAt)) {
      throw new UnauthorizedError("This verification code has expired.");
    }

    const submittedHash = await hashVerificationCode(input.verificationCode);
    const matches = submittedHash === challenge.verificationCodeHash;

    if (!matches) {
      throw new UnauthorizedError("The verification code is invalid.");
    }

    const consumedAt = new Date().toISOString();
    const existingStudentByAdmission = await studentsRepository.findByInstitutionAndAdmissionNumber(
      db,
      challenge.institutionId,
      challenge.admissionNumber
    );
    const existingStudentByEmail = await studentsRepository.findByInstitutionAndEmail(
      db,
      challenge.institutionId,
      challenge.email
    );

    if (
      existingStudentByAdmission &&
      normalizeEmail(existingStudentByAdmission.email) !== challenge.email
    ) {
      throw new AppError("Student identity conflict detected.", 409);
    }

    if (existingStudentByEmail && existingStudentByEmail.admissionNumber !== challenge.admissionNumber) {
      throw new AppError("Student identity conflict detected.", 409);
    }

    const student =
      existingStudentByAdmission ??
      existingStudentByEmail ??
      (await studentsRepository.create(db, {
        institutionId: challenge.institutionId,
        admissionNumber: challenge.admissionNumber,
        email: challenge.email,
        fullName: challenge.fullName,
        status: "pending_verification"
      }));

    await authRepository.attachStudent(db, challenge.id, student.id);
    await authRepository.consumeChallenge(db, challenge.id, consumedAt);
    await studentsRepository.markVerified(db, student.id, consumedAt);
    const authToken = await createAuthToken(student.id, challenge.institutionId, env.AUTH_TOKEN_SECRET ?? "");

    return {
      authenticated: true,
      studentId: student.id,
      institutionId: challenge.institutionId,
      consumedAt,
      accessToken: authToken.token,
      expiresAt: authToken.expiresAt
    };
  }
};
