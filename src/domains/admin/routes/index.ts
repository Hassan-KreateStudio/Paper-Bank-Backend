import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { AppError, UnauthorizedError } from "../../../lib/errors";
import { requireText } from "../../../lib/validation";
import { requireDb } from "../../../platform/db";
import { adminAccessMiddleware } from "../../../middleware";
import { adminService } from "../services";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", adminAccessMiddleware);

adminRoutes.get("/institutions", async (c) => {
  const db = requireDb(c.env);
  const items = await adminService.listInstitutions(db);

  return c.json({
    domain: "admin",
    items
  });
});

adminRoutes.get("/users", async (c) => {
  const db = requireDb(c.env);
  const items = await adminService.listUsers(db);

  return c.json({
    domain: "admin",
    items
  });
});

adminRoutes.get("/staff-users", async (c) => {
  const db = requireDb(c.env);
  const items = await adminService.listStaffUsers(db);

  return c.json({
    domain: "admin",
    items
  });
});

adminRoutes.post("/staff-users/:staffUserId/deactivate", async (c) => {
  const db = requireDb(c.env);
  const actorStaffUserId = c.get("staffUserId");

  if (!actorStaffUserId) {
    throw new UnauthorizedError("Authentication is required.");
  }

  return c.json({
    success: true,
    staffUser: await adminService.deactivateStaffUser(db, {
      staffUserId: c.req.param("staffUserId"),
      actorStaffUserId
    })
  });
});

adminRoutes.delete("/staff-users/:staffUserId", async (c) => {
  const db = requireDb(c.env);
  const actorStaffUserId = c.get("staffUserId");

  if (!actorStaffUserId) {
    throw new UnauthorizedError("Authentication is required.");
  }

  await adminService.deleteStaffUser(db, {
    staffUserId: c.req.param("staffUserId"),
    actorStaffUserId
  });

  return c.json({
    success: true
  });
});

adminRoutes.patch("/users/:studentId/role", async (c) => {
  throw new AppError("Admin staff promotion is not implemented yet.", 501, {
    clientMessage: "Admin staff promotion is not implemented yet."
  });
});

adminRoutes.get("/review/queue", async (c) => {
  const db = requireDb(c.env);
  const items = await adminService.listReviewQueue(db);

  return c.json({
    domain: "admin",
    items
  });
});

adminRoutes.post("/review/submissions/:uploadSubmissionId/approve", async (c) => {
  const db = requireDb(c.env);
  const payload = await c.req.json().catch(() => ({}));
  const result = await adminService.approveSubmission(
    db,
    c.env,
    c.req.param("uploadSubmissionId"),
    null,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});

adminRoutes.get("/review/submissions/:uploadSubmissionId", async (c) => {
  const db = requireDb(c.env);
  const result = await adminService.getSubmission(db, c.req.param("uploadSubmissionId"));

  return c.json({
    success: true,
    ...result
  });
});

adminRoutes.get("/review/submissions/:uploadSubmissionId/file", async (c) => {
  const db = requireDb(c.env);
  const { submission, file } = await adminService.getSubmissionFile(
    db,
    c.env,
    c.req.param("uploadSubmissionId")
  );

  return new Response(file.body, {
    headers: {
      "content-type": submission.mimeType || "application/pdf",
      "content-disposition": `inline; filename="${submission.fileName}"`
    }
  });
});

adminRoutes.post("/review/submissions/:uploadSubmissionId/reject", async (c) => {
  const db = requireDb(c.env);
  const payload = await c.req.json().catch(() => ({}));
  const result = await adminService.rejectSubmission(
    db,
    c.req.param("uploadSubmissionId"),
    null,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});

adminRoutes.post("/review/submissions/:uploadSubmissionId/hold", async (c) => {
  const db = requireDb(c.env);
  const payload = await c.req.json().catch(() => ({}));
  const result = await adminService.holdSubmission(
    db,
    c.req.param("uploadSubmissionId"),
    null,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});

adminRoutes.get("/papers", async (c) => {
  const db = requireDb(c.env);
  const items = await adminService.listPapers(db);

  return c.json({
    domain: "admin",
    items
  });
});

adminRoutes.get("/papers/:paperId", async (c) => {
  const db = requireDb(c.env);
  const result = await adminService.getPaper(db, c.req.param("paperId"));

  return c.json({
    success: true,
    ...result
  });
});

adminRoutes.get("/papers/:paperId/file", async (c) => {
  const db = requireDb(c.env);
  const { paper, file } = await adminService.getPaperFile(db, c.env, c.req.param("paperId"));

  return new Response(file.body, {
    headers: {
      "content-type": file.httpMetadata?.contentType || "application/pdf",
      "content-disposition": `inline; filename="${paper.title}.pdf"`
    }
  });
});

adminRoutes.post("/papers/:paperId/archive", async (c) => {
  const db = requireDb(c.env);
  const payload = await c.req.json().catch(() => ({}));
  const result = await adminService.archivePaper(
    db,
    c.req.param("paperId"),
    null,
    typeof payload.notes === "string" ? payload.notes.trim() || null : null
  );

  return c.json({
    success: true,
    ...result
  });
});

adminRoutes.get("/waitlist", async (c) => {
  const db = requireDb(c.env);
  const items = await adminService.listWaitlist(db);

  return c.json({
    domain: "admin",
    items
  });
});

adminRoutes.get("/analytics/overview", async (c) => {
  const db = requireDb(c.env);
  const overview = await adminService.getAnalyticsOverview(db);

  return c.json({
    domain: "admin",
    overview
  });
});

adminRoutes.post("/institutions", async () => {
  throw new AppError("Admin institution creation is not implemented yet.", 501, {
    clientMessage: "Admin institution creation is not implemented yet."
  });
});

adminRoutes.patch("/institutions/:institutionId", async () => {
  throw new AppError("Admin institution updates are not implemented yet.", 501, {
    clientMessage: "Admin institution updates are not implemented yet."
  });
});

adminRoutes.post("/invitations", async (c) => {
  const db = requireDb(c.env);
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const staffUserId = c.get("staffUserId");

  if (!staffUserId) {
    throw new UnauthorizedError("Authentication is required.");
  }

  return c.json({
    success: true,
    ...(await adminService.inviteReviewer(
      db,
      {
        institutionId: requireText(payload.institutionId, "institutionId"),
        email: requireText(payload.email, "email"),
        invitedByStaffUserId: staffUserId
      },
      c.env
    ))
  });
});

adminRoutes.get("/payments", async () => {
  throw new AppError("Admin payments are not implemented yet.", 501, {
    clientMessage: "Admin payments are not implemented yet."
  });
});

adminRoutes.get("/payments/:paymentId", async () => {
  throw new AppError("Admin payment detail is not implemented yet.", 501, {
    clientMessage: "Admin payment detail is not implemented yet."
  });
});

adminRoutes.post("/payments/:paymentId/approve", async () => {
  throw new AppError("Admin payment approval is not implemented yet.", 501, {
    clientMessage: "Admin payment approval is not implemented yet."
  });
});

adminRoutes.post("/payments/:paymentId/mark-paid", async () => {
  throw new AppError("Admin payment marking is not implemented yet.", 501, {
    clientMessage: "Admin payment marking is not implemented yet."
  });
});
