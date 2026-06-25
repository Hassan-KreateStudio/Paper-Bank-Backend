import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { requireDb } from "../../../platform/db";
import { UnauthorizedError } from "../../../lib/errors";
import { reviewService } from "../services";
import { reviewAccessMiddleware } from "../../../middleware";

export const reviewRoutes = new Hono<AppEnv>();

reviewRoutes.use("*", reviewAccessMiddleware);

reviewRoutes.get("/queue", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");
  const studentRole = c.get("studentRole");

  if (!studentRole) {
    throw new UnauthorizedError("Reviewer access is required.");
  }

  if (studentRole !== "admin" && !institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  const items = await reviewService.reviewQueue(db, {
    institutionId,
    studentRole
  });

  return c.json({
    domain: "review",
    items
  });
});

reviewRoutes.post("/submissions/:uploadSubmissionId/approve", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");
  const studentId = c.get("studentId");
  const studentRole = c.get("studentRole");

  if (!studentRole) {
    throw new UnauthorizedError("Reviewer access is required.");
  }

  if (studentRole !== "admin" && !institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  const payload = await c.req.json().catch(() => ({}));
  const result = await reviewService.approveSubmission(
    db,
    c.env,
    {
      institutionId,
      studentRole
    },
    c.req.param("uploadSubmissionId"),
    studentId,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});
