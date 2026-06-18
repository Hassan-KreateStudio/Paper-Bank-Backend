import { Hono } from "hono";
import type { AppEnv } from "../../lib/app-env";

export const paymentsWebhookRoute = new Hono<AppEnv>();

paymentsWebhookRoute.post("/", async (c) => {
  const payload = await c.req.text();

  return c.json({
    received: true,
    length: payload.length
  });
});
