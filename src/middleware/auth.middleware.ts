import type { MiddlewareHandler } from "hono";

export const authMiddleware: MiddlewareHandler = async (_c, next) => {
  await next();
};
