import { AppError } from "../../lib/errors";
import type { EnvBindings } from "../../lib/app-env";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type TransactionalEmailEnv = Pick<EnvBindings, "APP_ENV" | "RESEND_API_KEY" | "AUTH_EMAIL_FROM">;

const RESEND_URL = "https://api.resend.com/emails";

const sendTransactionalEmail = async (
  env: TransactionalEmailEnv,
  message: EmailMessage,
  missingConfigMessage: string,
  failedDeliveryMessage: string
) => {
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
    if (env.APP_ENV === "production") {
      throw new AppError(missingConfigMessage, 500);
    }

    return false;
  }

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "paper-bank-backend/0.1"
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  });

  if (response.ok) {
    return true;
  }

  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  throw new AppError(payload?.message || failedDeliveryMessage, 502);
};

const wrapHtml = (title: string, bodyLines: string[]) => {
  return [
    '<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">',
    `<h2 style="margin-bottom: 12px;">${title}</h2>`,
    ...bodyLines.map((line) => `<p>${line}</p>`),
    "</div>"
  ].join("");
};

const formatInstitutionLine = (institutionName: string) => `Institution: ${institutionName}`;

export const emailPlatform = {
  sendVerificationCode: async (
    env: TransactionalEmailEnv,
    input: {
      email: string;
      verificationCode: string;
    }
  ) => {
    const text = [
      "Your PaperBank verification code is below.",
      "",
      `Verification code: ${input.verificationCode}`,
      "",
      "This code expires in 10 minutes.",
      "",
      "If you did not request this code, you can ignore this email."
    ].join("\n");

    const html = wrapHtml("PaperBank verification code", [
      "Your PaperBank verification code is below.",
      `<span style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${input.verificationCode}</span>`,
      "This code expires in 10 minutes.",
      "If you did not request this code, you can ignore this email."
    ]);

    return sendTransactionalEmail(
      env,
      {
        to: input.email,
        subject: "Your PaperBank verification code",
        text,
        html
      },
      "Verification email delivery is not configured.",
      "Verification email could not be sent."
    );
  },
  sendStaffInvite: async (
    env: TransactionalEmailEnv,
    input: {
      email: string;
      institutionName: string;
      username: string;
      inviteId: string;
      inviteToken: string;
      expiresAt: string;
    }
  ) => {
    const text = [
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

    const html = wrapHtml(`PaperBank reviewer access for ${input.institutionName}`, [
      "You have been invited to review papers on PaperBank.",
      `<strong>Username:</strong> ${input.username}`,
      `<strong>Invite ID:</strong> ${input.inviteId}`,
      `<strong>Activation code:</strong> ${input.inviteToken}`,
      `This invite expires on ${input.expiresAt}.`,
      "Use these details to activate your staff account and set your password."
    ]);

    return sendTransactionalEmail(
      env,
      {
        to: input.email,
        subject: `Your PaperBank reviewer access for ${input.institutionName}`,
        text,
        html
      },
      "Reviewer invitation email delivery is not configured.",
      "Reviewer invitation email could not be sent."
    );
  },
  sendWaitlistJoined: async (
    env: TransactionalEmailEnv,
    input: {
      email: string;
      fullName: string;
      institutionName: string;
    }
  ) => {
    const text = [
      `Hi ${input.fullName},`,
      "",
      `You have successfully joined the PaperBank waitlist for ${input.institutionName}.`,
      "",
      "We will let you know when access opens up for your institution.",
      "",
      "Thank you for joining PaperBank."
    ].join("\n");

    const html = wrapHtml("You are on the PaperBank waitlist", [
      `Hi ${input.fullName},`,
      `You have successfully joined the PaperBank waitlist for ${input.institutionName}.`,
      "We will let you know when access opens up for your institution.",
      "Thank you for joining PaperBank."
    ]);

    return sendTransactionalEmail(
      env,
      {
        to: input.email,
        subject: `You joined the PaperBank waitlist for ${input.institutionName}`,
        text,
        html
      },
      "Waitlist email delivery is not configured.",
      "Waitlist confirmation email could not be sent."
    );
  },
  sendUploadSubmitted: async (
    env: TransactionalEmailEnv,
    input: {
      email: string;
      fullName: string;
      institutionName: string;
      title: string;
      unitCode: string;
      unitName: string;
      paperType: string;
    }
  ) => {
    const text = [
      `Hi ${input.fullName},`,
      "",
      "Your upload has been submitted successfully to PaperBank and is now in the review queue.",
      formatInstitutionLine(input.institutionName),
      `Title: ${input.title}`,
      `Unit: ${input.unitCode} - ${input.unitName}`,
      `Type: ${input.paperType.toUpperCase()}`,
      "",
      "We will email you again once this upload has been reviewed."
    ].join("\n");

    const html = wrapHtml("Your PaperBank upload was submitted", [
      `Hi ${input.fullName},`,
      "Your upload has been submitted successfully to PaperBank and is now in the review queue.",
      formatInstitutionLine(input.institutionName),
      `<strong>Title:</strong> ${input.title}`,
      `<strong>Unit:</strong> ${input.unitCode} - ${input.unitName}`,
      `<strong>Type:</strong> ${input.paperType.toUpperCase()}`,
      "We will email you again once this upload has been reviewed."
    ]);

    return sendTransactionalEmail(
      env,
      {
        to: input.email,
        subject: "Your PaperBank upload is now in review",
        text,
        html
      },
      "Upload notification email delivery is not configured.",
      "Upload notification email could not be sent."
    );
  },
  sendUploadApproved: async (
    env: TransactionalEmailEnv,
    input: {
      email: string;
      fullName: string;
      institutionName: string;
      title: string;
      unitCode: string;
      unitName: string;
      paperType: string;
    }
  ) => {
    const text = [
      `Hi ${input.fullName},`,
      "",
      "Good news. Your upload has been approved and is now part of PaperBank.",
      formatInstitutionLine(input.institutionName),
      `Title: ${input.title}`,
      `Unit: ${input.unitCode} - ${input.unitName}`,
      `Type: ${input.paperType.toUpperCase()}`,
      "",
      "Thank you for helping grow the PaperBank library."
    ].join("\n");

    const html = wrapHtml("Your PaperBank upload was approved", [
      `Hi ${input.fullName},`,
      "Good news. Your upload has been approved and is now part of PaperBank.",
      formatInstitutionLine(input.institutionName),
      `<strong>Title:</strong> ${input.title}`,
      `<strong>Unit:</strong> ${input.unitCode} - ${input.unitName}`,
      `<strong>Type:</strong> ${input.paperType.toUpperCase()}`,
      "Thank you for helping grow the PaperBank library."
    ]);

    return sendTransactionalEmail(
      env,
      {
        to: input.email,
        subject: "Your PaperBank upload was approved",
        text,
        html
      },
      "Approval notification email delivery is not configured.",
      "Approval notification email could not be sent."
    );
  }
};
