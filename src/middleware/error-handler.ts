import type { Hono } from "hono";
import type { AppEnv } from "../lib/app-env";
import { AppError } from "../lib/errors";

export const applyErrorHandler = (app: Hono<AppEnv>) => {
  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        {
          success: false,
          error: "application_error",
          message: error.message
        },
        error.status as 400
      );
    }

    return c.json(
      {
        success: false,
        error: "internal_error",
        message: error.message
      },
      500
    );
  });
};
