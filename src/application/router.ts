import type { Hono } from "hono";
import { routes } from "../routes";
import type { AppEnv } from "../lib/app-env";

export const registerRoutes = (app: Hono<AppEnv>) => {
  app.route("/", routes);
};
