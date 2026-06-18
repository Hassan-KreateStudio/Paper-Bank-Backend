import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const requestRoutes = new Hono<AppEnv>();

requestRoutes.post("/", async (c) => {
  const payload = await c.req.json().catch(() => ({}));

  return c.json({
    domain: "requests",
    payload
  });
});
