import type { MiddlewareHandler } from "hono";

export const rateLimitMiddleware: MiddlewareHandler = async (_c, next) => {
  await next();
};
