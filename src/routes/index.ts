import { Hono } from "hono";
import type { AppEnv } from "../lib/app-env";
import {
  authMiddleware,
  institutionMiddleware,
  rateLimitMiddleware,
  staffAuthMiddleware
} from "../middleware";
import { healthRoute } from "./health/health.route";
import { pingRoute } from "./ping/ping.route";
import { paymentsWebhookRoute } from "./webhooks/payments-webhook.route";
import { internalAdminRoute } from "./internal/internal-admin.route";
import { authRoutes } from "../domains/auth/routes";
import { staffAuthRoutes } from "../domains/staff-auth/routes";
import { institutionRoutes } from "../domains/institutions/routes";
import { studentRoutes } from "../domains/students/routes";
import { paperRoutes } from "../domains/papers/routes";
import { requestRoutes } from "../domains/requests/routes";
import { searchRoutes } from "../domains/search/routes";
import { accessRoutes } from "../domains/access/routes";
import { uploadRoutes } from "../domains/uploads/routes";
import { reviewRoutes } from "../domains/review/routes";
import { waitlistRoutes } from "../domains/waitlist/routes";
import { adminRoutes } from "../domains/admin/routes";

export const routes = new Hono<AppEnv>();
const studentProtectedApiRoutes = new Hono<AppEnv>();
const reviewApiRoutes = new Hono<AppEnv>();
const adminApiRoutes = new Hono<AppEnv>();

routes.get("/", (c) => {
  return c.json({
    name: "Strathmore PaperBank API",
    status: "ok",
    endpoints: ["/ping", "/health", "/health/live", "/health/ready"]
  });
});

routes.get("/debug/r2", (c) => {
  return c.json({
    hasBucket: Boolean(c.env.PAPERS_BUCKET)
  });
});

studentProtectedApiRoutes.use("*", institutionMiddleware);
studentProtectedApiRoutes.use("*", rateLimitMiddleware);
studentProtectedApiRoutes.use("*", authMiddleware);
studentProtectedApiRoutes.route("/students", studentRoutes);
studentProtectedApiRoutes.route("/papers", paperRoutes);
studentProtectedApiRoutes.route("/requests", requestRoutes);
studentProtectedApiRoutes.route("/search", searchRoutes);
studentProtectedApiRoutes.route("/access", accessRoutes);
studentProtectedApiRoutes.route("/uploads", uploadRoutes);

reviewApiRoutes.use("*", rateLimitMiddleware);
reviewApiRoutes.use("*", staffAuthMiddleware);
reviewApiRoutes.route("/", reviewRoutes);

adminApiRoutes.use("*", rateLimitMiddleware);
adminApiRoutes.use("*", staffAuthMiddleware);
adminApiRoutes.route("/", adminRoutes);

routes.route("/ping", pingRoute);
routes.route("/health", healthRoute);
routes.route("/webhooks/payments", paymentsWebhookRoute);
routes.route("/internal", internalAdminRoute);
routes.route("/api/auth", authRoutes);
routes.route("/api/staff-auth", staffAuthRoutes);
routes.route("/api/institutions", institutionRoutes);
routes.route("/api/waitlist", waitlistRoutes);
routes.route("/api/review", reviewApiRoutes);
routes.route("/api/admin", adminApiRoutes);
routes.route("/api", studentProtectedApiRoutes);
