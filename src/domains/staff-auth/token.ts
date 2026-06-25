import { AppError, UnauthorizedError } from "../../lib/errors";
import type { StaffRole } from "./contracts";

const TOKEN_TTL_HOURS = 24;
const textEncoder = new TextEncoder();

type StaffAuthTokenPayload = {
  sub: string;
  institutionId: string | null;
  role: StaffRole;
  exp: number;
};

const encodeBase64Url = (value: string) => {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(`${normalized}${padding}`);
};

const importHmacKey = async (secret: string) => {
  return await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

const sign = async (value: string, secret: string) => {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return encodeBase64Url(String.fromCharCode(...new Uint8Array(signature)));
};

export const createStaffAuthToken = async (
  staffUserId: string,
  institutionId: string | null,
  role: StaffRole,
  secret: string
) => {
  if (!secret) {
    throw new AppError("Staff auth token secret is not configured.", 500);
  }

  const payload: StaffAuthTokenPayload = {
    sub: staffUserId,
    institutionId,
    role,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_HOURS * 60 * 60
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await sign(encodedPayload, secret);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  };
};

export const verifyStaffAuthToken = async (token: string, secret: string) => {
  if (!secret) {
    throw new AppError("Staff auth token secret is not configured.", 500);
  }

  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    throw new UnauthorizedError("The staff auth token is invalid.");
  }

  const expectedSignature = await sign(encodedPayload, secret);

  if (expectedSignature !== providedSignature) {
    throw new UnauthorizedError("The staff auth token is invalid.");
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as StaffAuthTokenPayload;

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedError("The staff auth token has expired.");
  }

  return payload;
};
