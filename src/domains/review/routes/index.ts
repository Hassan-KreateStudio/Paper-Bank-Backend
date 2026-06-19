import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const reviewRoutes = new Hono<AppEnv>();

reviewRoutes.get("/queue", (c) => {
  return c.json({
    domain: "review",
    items: []
  });
});
