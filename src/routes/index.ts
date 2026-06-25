import { Hono } from "hono";
import type { AppEnv } from "../lib/app-env";
import { authMiddleware, institutionMiddleware, rateLimitMiddleware } from "../middleware";
import { healthRoute } from "./health/health.route";
import { pingRoute } from "./ping/ping.route";
import { paymentsWebhookRoute } from "./webhooks/payments-webhook.route";
import { internalAdminRoute } from "./internal/internal-admin.route";
import { authRoutes } from "../domains/auth/routes";
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
const protectedApiRoutes = new Hono<AppEnv>();

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

protectedApiRoutes.use("*", institutionMiddleware);
protectedApiRoutes.use("*", rateLimitMiddleware);
protectedApiRoutes.use("*", authMiddleware);
protectedApiRoutes.route("/students", studentRoutes);
protectedApiRoutes.route("/papers", paperRoutes);
protectedApiRoutes.route("/requests", requestRoutes);
protectedApiRoutes.route("/search", searchRoutes);
protectedApiRoutes.route("/access", accessRoutes);
protectedApiRoutes.route("/uploads", uploadRoutes);
protectedApiRoutes.route("/review", reviewRoutes);
protectedApiRoutes.route("/admin", adminRoutes);

routes.route("/ping", pingRoute);
routes.route("/health", healthRoute);
routes.route("/webhooks/payments", paymentsWebhookRoute);
routes.route("/internal", internalAdminRoute);
routes.route("/api/auth", authRoutes);
routes.route("/api/institutions", institutionRoutes);
routes.route("/api/waitlist", waitlistRoutes);
routes.route("/api", protectedApiRoutes);
