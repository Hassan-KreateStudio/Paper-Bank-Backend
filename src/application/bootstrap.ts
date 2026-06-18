import { Hono } from "hono";
import { registerRoutes } from "./router";
import { applyErrorHandler, applyMiddleware } from "../middleware";
import type { AppEnv } from "../lib/app-env";

export const createApp = () => {
  const app = new Hono<AppEnv>();

  applyMiddleware(app);
  applyErrorHandler(app);
  registerRoutes(app);

  return app;
};
