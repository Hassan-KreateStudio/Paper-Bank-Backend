import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { requireText } from "../../../lib/validation";
import { requireDb } from "../../../platform/db";
import { authService } from "../services";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/challenge", async (c) => {
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const db = requireDb(c.env);

  return c.json({
    success: true,
    ...(await authService.createChallenge(db, {
      admissionNumber: requireText(payload.admissionNumber, "admissionNumber"),
      email: requireText(payload.email, "email"),
      fullName: requireText(payload.fullName, "fullName")
    }))
  });
});

authRoutes.post("/verify", async (c) => {
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const db = requireDb(c.env);

  return c.json({
    success: true,
    ...(await authService.verifyChallenge(db, {
      challengeId: requireText(payload.challengeId, "challengeId"),
      verificationCode: requireText(payload.verificationCode, "verificationCode")
    }))
  });
});
