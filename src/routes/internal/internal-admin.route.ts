import { Hono } from "hono";
import type { AppEnv } from "../../lib/app-env";

export const internalAdminRoute = new Hono<AppEnv>();

internalAdminRoute.get("/ping", (c) => {
  return c.json({
    ok: true
  });
});
