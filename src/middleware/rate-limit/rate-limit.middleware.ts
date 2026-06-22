import type { MiddlewareHandler } from "hono";
import { AppError } from "../../lib/errors";
import { consumeRateLimit } from "../../platform/cache";

const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("cf-connecting-ip") ?? "unknown";
};

const getRateLimitRule = (path: string) => {
  if (path === "/api/auth/challenge") {
    return {
      key: "auth_challenge",
      limit: 5,
      windowSeconds: 60
    };
  }

  if (path === "/api/auth/verify") {
    return {
      key: "auth_verify",
      limit: 10,
      windowSeconds: 60
    };
  }

  if (path.startsWith("/api/")) {
    return {
      key: "api",
      limit: 120,
      windowSeconds: 60
    };
  }

  return null;
};

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const rule = getRateLimitRule(c.req.path);

  if (!rule) {
    await next();
    return;
  }

  const ipAddress = getClientIp(c.req.raw);
  const result = await consumeRateLimit(
    `rate_limit:${rule.key}:${ipAddress}`,
    rule.limit,
    rule.windowSeconds
  );

  c.header("x-rate-limit-limit", `${rule.limit}`);
  c.header("x-rate-limit-remaining", `${result.remaining}`);

  if (!result.allowed) {
    c.header("retry-after", `${result.retryAfterSeconds}`);
    throw new AppError(
      `Too many requests. Please try again in ${result.retryAfterSeconds} seconds.`,
      429
    );
  }

  await next();
};
