import type { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "../../lib/app-env";
import { logger } from "../../platform/observability";

const resolveRequestId = (request: Request) => {
  const incomingRequestId = request.headers.get("x-request-id")?.trim();

  return incomingRequestId && incomingRequestId.length > 0
    ? incomingRequestId
    : crypto.randomUUID();
};

export const applyMiddleware = (app: Hono<AppEnv>) => {
  app.use("*", async (c, next) => {
    const requestId = resolveRequestId(c.req.raw);
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
  });

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Authorization",
        "Content-Type",
        "X-Institution-Id",
        "X-Request-Id"
      ],
      exposeHeaders: [
        "X-Request-Id",
        "X-Rate-Limit-Limit",
        "X-Rate-Limit-Remaining",
        "Retry-After"
      ]
    })
  );

  app.use("*", async (c, next) => {
    const startedAt = Date.now();

    try {
      await next();
    } finally {
      logger.info("http request", {
        requestId: c.get("requestId"),
        method: c.req.method,
        route: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - startedAt
      });
    }
  });
};
