import type { Hono } from "hono";
import type { AppEnv } from "../lib/app-env";
import { authMiddleware } from "./auth.middleware";
import { institutionMiddleware } from "./institution.middleware";
import { rateLimitMiddleware } from "./rate-limit.middleware";
import { requestIdMiddleware } from "./request-id.middleware";

export { applyErrorHandler } from "./error-handler";

export const applyMiddleware = (app: Hono<AppEnv>) => {
  app.use("*", requestIdMiddleware);
  app.use("*", institutionMiddleware);
  app.use("*", rateLimitMiddleware);
  app.use("/api/*", authMiddleware);
};
