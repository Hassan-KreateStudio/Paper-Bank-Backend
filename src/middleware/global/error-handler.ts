import type { Hono } from "hono";
import type { AppEnv } from "../../lib/app-env";
import { AppError } from "../../lib/errors";
import { logger } from "../../platform/observability";

const fallbackClientMessageForStatus = (status: number): string => {
  if (status === 401) return "You are not authorized to perform this action.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "Route not found.";
  if (status === 409) return "This request conflicts with existing data.";
  if (status === 422) return "We could not process this request.";
  if (status === 429) return "Too many requests. Please try again shortly.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "We could not process this request.";
};

const resolveClientMessage = (error: AppError): string => {
  if (error.clientMessage) {
    return error.clientMessage;
  }

  if (error.status >= 500) {
    return fallbackClientMessageForStatus(error.status);
  }

  return error.message;
};

export const applyErrorHandlers = (app: Hono<AppEnv>) => {
  app.onError((error, c) => {
    const requestId = c.get("requestId");
    const route = `${c.req.method} ${c.req.path}`;

    if (error instanceof AppError) {
      const clientMessage = resolveClientMessage(error);

      logger.error("application error", {
        requestId,
        route,
        status: error.status,
        error: error.code,
        message: error.message,
        clientMessage,
        details: error.details
      });

      return c.json(
        {
          success: false,
          message: clientMessage
        },
        error.status as 400
      );
    }

    logger.error("internal error", {
      requestId,
      route,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return c.json(
      {
        success: false,
        message: fallbackClientMessageForStatus(500)
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
        message: "Route not found."
      },
      404
    );
  });
};
