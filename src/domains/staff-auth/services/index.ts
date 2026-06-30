import type { EnvBindings } from "../../../lib/app-env";
import { AppError, UnauthorizedError } from "../../../lib/errors";
import { emailPlatform } from "../../../platform/email";
import { generateStaffInviteToken, hashStaffInviteToken } from "../invite";
import { hashStaffPassword } from "../password";
import { staffAuthRepository } from "../repository";
import { verifyStaffPassword } from "../password";
import { createStaffAuthToken } from "../token";
import { generatePlayfulReviewerUsername } from "../username";

const STAFF_INVITE_TTL_DAYS = 7;
const PENDING_STAFF_PASSWORD_HASH = "pending_invite";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isExpired = (expiresAt: string) => new Date(expiresAt).getTime() <= Date.now();

const createInviteExpiry = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + STAFF_INVITE_TTL_DAYS);
  return expiresAt.toISOString();
};

const buildAvailableUsername = async (db: D1Database) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generatePlayfulReviewerUsername();
    const existingUser = await staffAuthRepository.findByUsername(db, candidate);

    if (!existingUser) {
      return candidate;
    }
  }

  throw new AppError("A unique reviewer username could not be generated.", 500);
};

export const staffAuthService = {
  login: async (
    db: D1Database,
    input: {
      username: string;
      password: string;
    },
    env: EnvBindings
  ) => {
    const staffUser = await staffAuthRepository.findByUsername(db, input.username);

    if (!staffUser) {
      throw new UnauthorizedError("The staff credentials are invalid.");
    }

    if (staffUser.status !== "active") {
      throw new UnauthorizedError("The staff account is not active.");
    }

    const passwordMatches = await verifyStaffPassword(input.password, staffUser.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedError("The staff credentials are invalid.");
    }

    const authToken = await createStaffAuthToken(
      staffUser.id,
      staffUser.institutionId,
      staffUser.role,
      env.STAFF_AUTH_TOKEN_SECRET ?? ""
    );

    return {
      accessToken: authToken.token,
      expiresAt: authToken.expiresAt,
      staffUser: {
        id: staffUser.id,
        institutionId: staffUser.institutionId,
        email: staffUser.email,
        username: staffUser.username,
        role: staffUser.role,
        status: staffUser.status
      }
    };
  },
  createReviewerInvitation: async (
    db: D1Database,
    input: {
      institutionId: string;
      institutionName: string;
      email: string;
      invitedByStaffUserId: string;
    },
    env: Pick<EnvBindings, "APP_ENV" | "RESEND_API_KEY" | "AUTH_EMAIL_FROM">
  ) => {
    const normalizedEmail = normalizeEmail(input.email);
    const existingInvite = await staffAuthRepository.findPendingInviteByEmail(
      db,
      input.institutionId,
      normalizedEmail
    );

    if (existingInvite && !isExpired(existingInvite.expiresAt)) {
      throw new AppError("A reviewer invite for this email is already pending.", 409);
    }

    const existingStaffUser = await staffAuthRepository.findByEmail(db, normalizedEmail);

    if (existingStaffUser && existingStaffUser.status === "inactive" && existingInvite) {
      await staffAuthRepository.deleteInvite(db, existingInvite.id);
      await staffAuthRepository.deleteUser(db, existingStaffUser.id);
    } else if (existingStaffUser) {
      throw new AppError("A staff account with this email already exists.", 409);
    }

    const username = await buildAvailableUsername(db);
    const inviteToken = generateStaffInviteToken();
    const inviteId = crypto.randomUUID();
    const staffUserId = crypto.randomUUID();
    const expiresAt = createInviteExpiry();

    await staffAuthRepository.create(db, {
      id: staffUserId,
      institutionId: input.institutionId,
      email: normalizedEmail,
      username,
      passwordHash: PENDING_STAFF_PASSWORD_HASH,
      role: "reviewer",
      status: "inactive"
    });

    await staffAuthRepository.createInvite(db, {
      id: inviteId,
      institutionId: input.institutionId,
      email: normalizedEmail,
      username,
      role: "reviewer",
      inviteTokenHash: await hashStaffInviteToken(inviteToken),
      expiresAt,
      invitedByStaffUserId: input.invitedByStaffUserId
    });

    try {
      await emailPlatform.sendStaffInvite(
        env,
        {
          email: normalizedEmail,
          institutionName: input.institutionName,
          username,
          inviteId,
          inviteToken,
          expiresAt
        }
      );
    } catch (error) {
      await staffAuthRepository.deleteInvite(db, inviteId);
      await staffAuthRepository.deleteUser(db, staffUserId);
      throw error;
    }

    return {
      invitation: {
        id: inviteId,
        institutionId: input.institutionId,
        email: normalizedEmail,
        username,
        role: "reviewer" as const,
        expiresAt
      }
    };
  },
  activateInvite: async (
    db: D1Database,
    input: {
      inviteId: string;
      inviteToken: string;
      password: string;
    },
    env: Pick<EnvBindings, "STAFF_AUTH_TOKEN_SECRET">
  ) => {
    const invite = await staffAuthRepository.findInviteById(db, input.inviteId);

    if (!invite) {
      throw new UnauthorizedError("The staff invite is invalid.");
    }

    if (invite.consumedAt) {
      throw new AppError("This staff invite has already been used.", 409);
    }

    if (isExpired(invite.expiresAt)) {
      throw new UnauthorizedError("This staff invite has expired.");
    }

    const submittedTokenHash = await hashStaffInviteToken(input.inviteToken);

    if (submittedTokenHash !== invite.inviteTokenHash) {
      throw new UnauthorizedError("The staff invite is invalid.");
    }

    const staffUser = await staffAuthRepository.findByEmail(db, invite.email);

    if (!staffUser) {
      throw new AppError("The invited staff account was not found.", 500);
    }

    const passwordHash = await hashStaffPassword(input.password);
    const activatedStaffUser = await staffAuthRepository.activate(db, staffUser.id, passwordHash);

    if (!activatedStaffUser) {
      throw new AppError("The invited staff account could not be activated.", 500);
    }

    await staffAuthRepository.consumeInvite(db, invite.id);

    const authToken = await createStaffAuthToken(
      activatedStaffUser.id,
      activatedStaffUser.institutionId,
      activatedStaffUser.role,
      env.STAFF_AUTH_TOKEN_SECRET ?? ""
    );

    return {
      accessToken: authToken.token,
      expiresAt: authToken.expiresAt,
      staffUser: {
        id: activatedStaffUser.id,
        institutionId: activatedStaffUser.institutionId,
        email: activatedStaffUser.email,
        username: activatedStaffUser.username,
        role: activatedStaffUser.role,
        status: activatedStaffUser.status
      }
    };
  }
};
