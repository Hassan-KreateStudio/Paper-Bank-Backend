import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.post("/", async (c) => {
  const payload = await c.req.json().catch(() => ({}));

  return c.json({
    domain: "uploads",
    payload
  });
});
