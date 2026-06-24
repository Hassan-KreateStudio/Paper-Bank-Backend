import { institutionsRepository } from "../../institutions/repository";
import { studentsRepository } from "../../students/repository";
import { AppError, NotFoundError, UnauthorizedError } from "../../../lib/errors";
import type { EnvBindings } from "../../../lib/app-env";
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

const createVerificationEmailText = (verificationCode: string) => {
  return [
    "Your PaperBank verification code is below.",
    "",
    `Verification code: ${verificationCode}`,
    "",
    "This code expires in 10 minutes.",
    "",
    "If you did not request this code, you can ignore this email."
  ].join("\n");
};

const createVerificationEmailHtml = (verificationCode: string) => {
  return [
    "<div style=\"font-family: Arial, sans-serif; line-height: 1.6; color: #111827;\">",
    "<h2 style=\"margin-bottom: 12px;\">PaperBank verification code</h2>",
    "<p>Your PaperBank verification code is below.</p>",
    `<p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 20px 0;">${verificationCode}</p>`,
    "<p>This code expires in 10 minutes.</p>",
    "<p>If you did not request this code, you can ignore this email.</p>",
    "</div>"
  ].join("");
};

const sendVerificationEmail = async (
  email: string,
  verificationCode: string,
  env: Pick<EnvBindings, "APP_ENV" | "RESEND_API_KEY" | "AUTH_EMAIL_FROM">
) => {
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
    if (env.APP_ENV === "production") {
      throw new AppError("Verification email delivery is not configured.", 500);
    }

    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "paper-bank-backend/0.1"
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: [email],
      subject: "Your PaperBank verification code",
      text: createVerificationEmailText(verificationCode),
      html: createVerificationEmailHtml(verificationCode)
    })
  });

  if (response.ok) {
    return true;
  }

  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  const message = payload?.message || "Verification email could not be sent.";

  throw new AppError(message, 502);
};

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
    env: Pick<EnvBindings, "APP_ENV" | "RESEND_API_KEY" | "AUTH_EMAIL_FROM">,
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

    const emailWasSent = await sendVerificationEmail(challenge.email, verificationCode, env);

    logger.info("Auth verification code generated", {
      challengeId: challenge.id,
      institutionId: institution.id,
      studentId: challenge.studentId,
      email: challenge.email,
      verificationCode,
      delivery: emailWasSent ? "resend" : "log_fallback"
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
