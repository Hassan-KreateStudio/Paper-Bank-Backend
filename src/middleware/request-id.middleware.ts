import type { MiddlewareHandler } from "hono";

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
};
