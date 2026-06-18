import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const paperRoutes = new Hono<AppEnv>();

paperRoutes.get("/", (c) => {
  return c.json({
    domain: "papers",
    items: []
  });
});
