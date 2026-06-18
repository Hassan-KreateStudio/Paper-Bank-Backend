import type { MiddlewareHandler } from "hono";

export const institutionMiddleware: MiddlewareHandler = async (c, next) => {
  const institutionId = c.req.header("x-institution-id") ?? null;
  c.set("institutionId", institutionId);
  await next();
};
