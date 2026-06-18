import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const accessRoutes = new Hono<AppEnv>();

accessRoutes.get("/:paperId", (c) => {
  return c.json({
    domain: "access",
    paperId: c.req.param("paperId"),
    allowed: false
  });
});
