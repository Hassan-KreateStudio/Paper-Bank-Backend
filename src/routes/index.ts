import { Hono } from "hono";
import type { AppEnv } from "../lib/app-env";
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
import { moderationRoutes } from "../domains/moderation/routes";

export const routes = new Hono<AppEnv>();

routes.get("/", (c) => {
  return c.json({
    name: "Strathmore PaperBank API",
    status: "ok",
    endpoints: ["/ping", "/health", "/health/live", "/health/ready"]
  });
});

routes.route("/ping", pingRoute);
routes.route("/health", healthRoute);
routes.route("/webhooks/payments", paymentsWebhookRoute);
routes.route("/internal", internalAdminRoute);
routes.route("/api/auth", authRoutes);
routes.route("/api/institutions", institutionRoutes);
routes.route("/api/students", studentRoutes);
routes.route("/api/papers", paperRoutes);
routes.route("/api/requests", requestRoutes);
routes.route("/api/search", searchRoutes);
routes.route("/api/access", accessRoutes);
routes.route("/api/uploads", uploadRoutes);
routes.route("/api/moderation", moderationRoutes);
