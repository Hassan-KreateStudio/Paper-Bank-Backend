import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { studentsRepository } from "../repository";
import { AppError, UnauthorizedError } from "../../../lib/errors";

export const studentRoutes = new Hono<AppEnv>();

studentRoutes.get("/me", async (c) => {
  const db = c.env.DB;
  const studentId = c.get("studentId");

  if (!db) {
    throw new AppError("D1 database binding is not configured.", 500);
  }

  if (!studentId) {
    throw new UnauthorizedError("Authentication is required.");
  }

  const student = await studentsRepository.findById(db, studentId);

  if (!student) {
    throw new UnauthorizedError("Authenticated student was not found.");
  }

  return c.json({
    domain: "students",
    student
  });
});
