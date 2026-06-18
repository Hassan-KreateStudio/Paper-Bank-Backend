import { Hono } from "hono";
import type { AppEnv } from "../../lib/app-env";

export const pingRoute = new Hono<AppEnv>();

pingRoute.get("/", (c) => {
  return c.json({
    ok: true,
    message: "pong"
  });
});
