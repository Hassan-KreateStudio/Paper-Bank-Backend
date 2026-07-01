import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { studentsRepository } from "../repository";
import { AppError, UnauthorizedError } from "../../../lib/errors";
import { rewardsService } from "../../rewards/services";

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

studentRoutes.get("/me/rewards", async (c) => {
  const db = c.env.DB;
  const studentId = c.get("studentId");

  if (!db) {
    throw new AppError("D1 database binding is not configured.", 500);
  }

  if (!studentId) {
    throw new UnauthorizedError("Authentication is required.");
  }

  const result = await rewardsService.getStudentRewards(db, studentId);

  return c.json({
    domain: "students",
    rewards: result.rewards
  });
});

studentRoutes.post("/me/cashouts", async (c) => {
  const db = c.env.DB;
  const studentId = c.get("studentId");

  if (!db) {
    throw new AppError("D1 database binding is not configured.", 500);
  }

  if (!studentId) {
    throw new UnauthorizedError("Authentication is required.");
  }

  const payload = (await c.req.json().catch(() => ({}))) as { mpesaPhoneNumber?: string };
  const mpesaPhoneNumber = payload.mpesaPhoneNumber?.trim();

  if (!mpesaPhoneNumber) {
    throw new AppError("M-PESA phone number is required.", 400);
  }

  const result = await rewardsService.requestCashout(db, {
    studentId,
    mpesaPhoneNumber
  });

  return c.json({
    success: true,
    cashoutRequest: result.cashoutRequest,
    rewards: result.rewards
  });
});
