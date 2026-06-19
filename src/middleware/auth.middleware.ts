import type { MiddlewareHandler } from "hono";
import { studentsRepository } from "../domains/students/repository";
import { verifyAuthToken } from "../domains/auth/token";
import { AppError, UnauthorizedError } from "../lib/errors";
import { getCached, setCached } from "../platform/cache";

const AUTH_SESSION_CACHE_TTL_SECONDS = 60;

type CachedAuthSession = {
  studentId: string;
  institutionId: string;
};

const getBearerToken = (authorizationHeader: string | undefined) => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.path === "/api/auth/challenge" || c.req.path === "/api/auth/verify") {
    await next();
    return;
  }

  const token = getBearerToken(c.req.header("authorization"));

  if (!token) {
    throw new UnauthorizedError("A valid bearer token is required.");
  }

  const db = c.env.DB;

  if (!db) {
    throw new AppError("D1 database binding is not configured.", 500);
  }

  const payload = await verifyAuthToken(token, c.env.AUTH_TOKEN_SECRET ?? "");
  const cachedSession = await getCached<CachedAuthSession>(`auth_session:${token}`);

  if (cachedSession) {
    c.set("studentId", cachedSession.studentId);
    c.set("institutionId", cachedSession.institutionId);
    await next();
    return;
  }

  const student = await studentsRepository.findById(db, payload.sub);

  if (!student || student.institutionId !== payload.institutionId) {
    throw new UnauthorizedError("The auth token is invalid.");
  }

  if (student.status !== "active") {
    throw new UnauthorizedError("The student account is not active.");
  }

  c.set("studentId", student.id);
  c.set("institutionId", student.institutionId);
  await setCached(
    `auth_session:${token}`,
    {
      studentId: student.id,
      institutionId: student.institutionId
    },
    AUTH_SESSION_CACHE_TTL_SECONDS
  );
  await next();
};
