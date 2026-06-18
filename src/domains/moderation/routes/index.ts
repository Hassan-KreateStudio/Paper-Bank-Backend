import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const moderationRoutes = new Hono<AppEnv>();

moderationRoutes.get("/queue", (c) => {
  return c.json({
    domain: "moderation",
    items: []
  });
});
