import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  const payload = await c.req.json().catch(() => ({}));

  return c.json({
    domain: "auth",
    action: "login",
    payload
  });
});
