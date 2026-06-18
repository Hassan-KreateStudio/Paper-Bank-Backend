import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const searchRoutes = new Hono<AppEnv>();

searchRoutes.post("/", async (c) => {
  const payload = await c.req.json().catch(() => ({}));

  return c.json({
    domain: "search",
    results: [],
    payload
  });
});
