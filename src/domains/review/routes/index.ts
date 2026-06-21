import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { requireDb } from "../../../platform/db";
import { UnauthorizedError } from "../../../lib/errors";
import { reviewService } from "../services";

export const reviewRoutes = new Hono<AppEnv>();

reviewRoutes.get("/queue", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");

  if (!institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  const items = await reviewService.reviewQueue(db, institutionId);

  return c.json({
    domain: "review",
    items
  });
});

reviewRoutes.post("/submissions/:uploadSubmissionId/approve", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");
  const studentId = c.get("studentId");

  if (!institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  const payload = await c.req.json().catch(() => ({}));
  const result = await reviewService.approveSubmission(
    db,
    c.env,
    institutionId,
    c.req.param("uploadSubmissionId"),
    studentId,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});
