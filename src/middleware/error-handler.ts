import type { Hono } from "hono";
import type { AppEnv } from "../lib/app-env";

export const applyErrorHandler = (app: Hono<AppEnv>) => {
  app.onError((error, c) => {
    return c.json(
      {
        error: "internal_error",
        message: error.message
      },
      500
    );
  });
};
