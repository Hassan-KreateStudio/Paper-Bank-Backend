import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { UnauthorizedError } from "../../../lib/errors";
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

adminRoutes.patch("/users/:studentId/role", async (c) => {
  const db = requireDb(c.env);
  const payload = await c.req.json().catch(() => ({}));
  const role = typeof payload.role === "string" ? payload.role.trim().toLowerCase() : "";
  const user = await adminService.updateUserRole(db, c.req.param("studentId"), role);

  return c.json({
    success: true,
    user
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
  const studentId = c.get("studentId");

  if (!studentId) {
    throw new UnauthorizedError("Authentication is required.");
  }

  const payload = await c.req.json().catch(() => ({}));
  const result = await adminService.approveSubmission(
    db,
    c.env,
    c.req.param("uploadSubmissionId"),
    studentId,
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
