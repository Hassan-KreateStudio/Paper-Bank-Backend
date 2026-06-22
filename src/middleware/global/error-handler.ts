import type { Hono } from "hono";
import type { AppEnv } from "../../lib/app-env";
import { AppError } from "../../lib/errors";
import { logger } from "../../platform/observability";

export const applyErrorHandlers = (app: Hono<AppEnv>) => {
  app.onError((error, c) => {
    const requestId = c.get("requestId");
    const route = `${c.req.method} ${c.req.path}`;

    if (error instanceof AppError) {
      logger.error("application error", {
        requestId,
        route,
        status: error.status,
        message: error.message
      });

      return c.json(
        {
          success: false,
          error: "application_error",
          message: error.message
        },
        error.status as 400
      );
    }

    logger.error("internal error", {
      requestId,
      route,
      message: error instanceof Error ? error.message : String(error)
    });

    return c.json(
      {
        success: false,
        error: "internal_error",
        message: error instanceof Error ? error.message : String(error)
      },
      500
    );
  });

  app.notFound((c) => {
    logger.info("not found", {
      requestId: c.get("requestId"),
      route: `${c.req.method} ${c.req.path}`
    });

    return c.json(
      {
        success: false,
        error: "not_found",
        message: "Route not found."
      },
      404
    );
  });
};
