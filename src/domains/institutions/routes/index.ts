import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const institutionRoutes = new Hono<AppEnv>();

institutionRoutes.get("/", (c) => {
  return c.json({
    domain: "institutions",
    items: []
  });
});
