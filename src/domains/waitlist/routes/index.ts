import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { UnauthorizedError } from "../../../lib/errors";
import { authMiddleware } from "../../../middleware";
import { studentsRepository } from "../../students/repository";
import { requireDb } from "../../../platform/db";
import { waitlistService } from "../services";

export const waitlistRoutes = new Hono<AppEnv>();

waitlistRoutes.use("*", authMiddleware);

waitlistRoutes.post("/", async (c) => {
  const db = requireDb(c.env);
  const studentId = c.get("studentId");

  if (!studentId) {
    throw new UnauthorizedError("A valid bearer token is required.");
  }

  const student = await studentsRepository.findById(db, studentId);

  if (!student) {
    throw new UnauthorizedError("The auth token is invalid.");
  }

  await waitlistService.joinAuthenticatedStudent(db, student, c.env);

  return c.json({
    success: true,
    message: "You have been added to the waitlist."
  });
});
