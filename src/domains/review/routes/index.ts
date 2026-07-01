import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { reviewAccessMiddleware } from "../../../middleware";
import { AppError, UnauthorizedError } from "../../../lib/errors";
import { requireDb } from "../../../platform/db";
import { reviewService } from "../services";

export const reviewRoutes = new Hono<AppEnv>();

reviewRoutes.use("*", reviewAccessMiddleware);

const requireReviewScope = (c: Context<AppEnv>) => {
  const institutionId = c.get("institutionId");
  const staffRole = c.get("staffRole");

  if (!staffRole) {
    throw new UnauthorizedError("Reviewer access is required.");
  }

  if (staffRole !== "admin" && !institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  return {
    institutionId,
    staffRole
  };
};

reviewRoutes.get("/queue", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);

  const items = await reviewService.reviewQueue(db, scope);

  return c.json({
    domain: "review",
    items
  });
});

reviewRoutes.get("/submissions/:uploadSubmissionId", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const result = await reviewService.getSubmission(db, scope, c.req.param("uploadSubmissionId"));

  return c.json({
    success: true,
    ...result
  });
});

reviewRoutes.get("/submissions/:uploadSubmissionId/file", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const { submission, file } = await reviewService.getSubmissionFile(
    db,
    c.env,
    scope,
    c.req.param("uploadSubmissionId")
  );

  return new Response(file.body, {
    headers: {
      "content-type": submission.mimeType || "application/pdf",
      "content-disposition": `inline; filename="${submission.fileName}"`
    }
  });
});

reviewRoutes.get("/submissions/:uploadSubmissionId/context", async () => {
  throw new AppError("Reviewer submission context is not implemented yet.", 501, {
    clientMessage: "Reviewer submission context is not implemented yet."
  });
});

reviewRoutes.post("/submissions/:uploadSubmissionId/approve", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const payload = await c.req.json().catch(() => ({}));
  const result = await reviewService.approveSubmission(
    db,
    c.env,
    scope,
    c.req.param("uploadSubmissionId"),
    null,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});

reviewRoutes.post("/submissions/:uploadSubmissionId/reject", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const payload = await c.req.json().catch(() => ({}));
  const result = await reviewService.rejectSubmission(
    db,
    scope,
    c.req.param("uploadSubmissionId"),
    null,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});

reviewRoutes.post("/submissions/:uploadSubmissionId/hold", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const payload = await c.req.json().catch(() => ({}));
  const result = await reviewService.holdSubmission(
    db,
    scope,
    c.req.param("uploadSubmissionId"),
    null,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});

reviewRoutes.get("/papers", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const items = await reviewService.listPapers(db, scope);

  return c.json({
    domain: "review",
    items
  });
});

reviewRoutes.get("/cashouts", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const items = await reviewService.listCashouts(db, scope);

  return c.json({
    domain: "review",
    items
  });
});

reviewRoutes.get("/papers/:paperId", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const result = await reviewService.getPaper(db, scope, c.req.param("paperId"));

  return c.json({
    success: true,
    ...result
  });
});

reviewRoutes.get("/papers/:paperId/file", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const { paper, file } = await reviewService.getPaperFile(db, c.env, scope, c.req.param("paperId"));

  return new Response(file.body, {
    headers: {
      "content-type": file.httpMetadata?.contentType || "application/pdf",
      "content-disposition": `inline; filename="${paper.title}.pdf"`
    }
  });
});

reviewRoutes.post("/papers/:paperId/archive", async (c) => {
  const db = requireDb(c.env);
  const scope = requireReviewScope(c);
  const payload = await c.req.json().catch(() => ({}));
  const result = await reviewService.archivePaper(
    db,
    scope,
    c.req.param("paperId"),
    null,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});
