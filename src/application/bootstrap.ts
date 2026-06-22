import { Hono } from "hono";
import { registerRoutes } from "./router";
import { applyErrorHandlers, applyMiddleware } from "../middleware";
import type { AppEnv } from "../lib/app-env";

export const createApp = () => {
  const app = new Hono<AppEnv>();

  applyMiddleware(app);
  applyErrorHandlers(app);
  registerRoutes(app);

  return app;
};
