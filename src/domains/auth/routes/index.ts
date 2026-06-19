import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { requireText } from "../../../lib/validation";
import { requireDb } from "../../../platform/db";
import { authService } from "../services";
import { studentsRepository } from "../../students/repository";
import { UnauthorizedError } from "../../../lib/errors";

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
    }, c.env))
  });
});

authRoutes.get("/session", async (c) => {
  const db = requireDb(c.env);
  const studentId = c.get("studentId");

  if (!studentId) {
    throw new UnauthorizedError("Authentication is required.");
  }

  const student = await studentsRepository.findById(db, studentId);

  if (!student) {
    throw new UnauthorizedError("Authenticated student was not found.");
  }

  return c.json({
    success: true,
    authenticated: true,
    student
  });
});
