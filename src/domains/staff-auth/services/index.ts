import type { EnvBindings } from "../../../lib/app-env";
import { AppError, UnauthorizedError } from "../../../lib/errors";
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

const createStaffInviteEmailText = (input: {
  institutionName: string;
  username: string;
  inviteId: string;
  inviteToken: string;
  expiresAt: string;
}) => {
  return [
    `You have been invited to review papers for ${input.institutionName} on PaperBank.`,
    "",
    `Username: ${input.username}`,
    `Invite ID: ${input.inviteId}`,
    `Activation code: ${input.inviteToken}`,
    "",
    `This invite expires on ${input.expiresAt}.`,
    "",
    "Use these details to activate your staff account and set your password."
  ].join("\n");
};

const createStaffInviteEmailHtml = (input: {
  institutionName: string;
  username: string;
  inviteId: string;
  inviteToken: string;
  expiresAt: string;
}) => {
  return [
    "<div style=\"font-family: Arial, sans-serif; line-height: 1.6; color: #111827;\">",
    `<h2 style="margin-bottom: 12px;">PaperBank reviewer access for ${input.institutionName}</h2>`,
    "<p>You have been invited to review papers on PaperBank.</p>",
    `<p><strong>Username:</strong> ${input.username}</p>`,
    `<p><strong>Invite ID:</strong> ${input.inviteId}</p>`,
    `<p><strong>Activation code:</strong> ${input.inviteToken}</p>`,
    `<p>This invite expires on ${input.expiresAt}.</p>`,
    "<p>Use these details to activate your staff account and set your password.</p>",
    "</div>"
  ].join("");
};

const sendStaffInviteEmail = async (
  email: string,
  input: {
    institutionName: string;
    username: string;
    inviteId: string;
    inviteToken: string;
    expiresAt: string;
  },
  env: Pick<EnvBindings, "APP_ENV" | "RESEND_API_KEY" | "AUTH_EMAIL_FROM">
) => {
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
    if (env.APP_ENV === "production") {
      throw new AppError("Reviewer invitation email delivery is not configured.", 500);
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
      subject: `Your PaperBank reviewer access for ${input.institutionName}`,
      text: createStaffInviteEmailText(input),
      html: createStaffInviteEmailHtml(input)
    })
  });

  if (response.ok) {
    return true;
  }

  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  throw new AppError(payload?.message || "Reviewer invitation email could not be sent.", 502);
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
      await sendStaffInviteEmail(
        normalizedEmail,
        {
          institutionName: input.institutionName,
          username,
          inviteId,
          inviteToken,
          expiresAt
        },
        env
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
