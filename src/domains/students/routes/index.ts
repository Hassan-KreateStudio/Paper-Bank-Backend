import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";

export const studentRoutes = new Hono<AppEnv>();

studentRoutes.get("/me", (c) => {
  return c.json({
    domain: "students",
    student: null
  });
});
