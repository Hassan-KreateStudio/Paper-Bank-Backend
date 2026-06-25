import type { MiddlewareHandler } from "hono";
import { studentsRepository } from "../../domains/students/repository";
import { verifyAuthToken } from "../../domains/auth/token";
import { staffAuthRepository } from "../../domains/staff-auth/repository";
import { verifyStaffAuthToken } from "../../domains/staff-auth/token";
import { AppError, UnauthorizedError } from "../../lib/errors";
import { getCached, setCached } from "../../platform/cache";
import type { StudentRole } from "../../domains/students/contracts";
import type { StaffRole } from "../../domains/staff-auth/contracts";

const AUTH_SESSION_CACHE_TTL_SECONDS = 60;

type CachedAuthSession = {
  studentId: string;
  institutionId: string;
  studentRole: StudentRole;
};

type CachedStaffAuthSession = {
  staffUserId: string;
  institutionId: string | null;
  staffRole: StaffRole;
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

const resolveAuthenticatedStudent = async (
  c: Parameters<MiddlewareHandler>[0],
  token: string
) => {
  const db = c.env.DB;

  if (!db) {
    throw new AppError("D1 database binding is not configured.", 500);
  }

  const payload = await verifyAuthToken(token, c.env.AUTH_TOKEN_SECRET ?? "");
  const cachedSession = await getCached<CachedAuthSession>(`auth_session:${token}`);

  if (cachedSession) {
    c.set("studentId", cachedSession.studentId);
    c.set("institutionId", cachedSession.institutionId);
    c.set("studentRole", cachedSession.studentRole);
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
  c.set("studentRole", student.role);
  await setCached(
    `auth_session:${token}`,
    {
      studentId: student.id,
      institutionId: student.institutionId,
      studentRole: student.role
    },
    AUTH_SESSION_CACHE_TTL_SECONDS
  );
};

const resolveAuthenticatedStaff = async (c: Parameters<MiddlewareHandler>[0], token: string) => {
  const db = c.env.DB;

  if (!db) {
    throw new AppError("D1 database binding is not configured.", 500);
  }

  const payload = await verifyStaffAuthToken(token, c.env.STAFF_AUTH_TOKEN_SECRET ?? "");
  const cachedSession = await getCached<CachedStaffAuthSession>(`staff_auth_session:${token}`);

  if (cachedSession) {
    c.set("staffUserId", cachedSession.staffUserId);
    c.set("institutionId", cachedSession.institutionId);
    c.set("staffRole", cachedSession.staffRole);
    return;
  }

  const staffUser = await staffAuthRepository.findById(db, payload.sub);

  if (!staffUser || staffUser.institutionId !== payload.institutionId) {
    throw new UnauthorizedError("The staff auth token is invalid.");
  }

  if (staffUser.status !== "active") {
    throw new UnauthorizedError("The staff account is not active.");
  }

  c.set("staffUserId", staffUser.id);
  c.set("institutionId", staffUser.institutionId);
  c.set("staffRole", staffUser.role);
  await setCached(
    `staff_auth_session:${token}`,
    {
      staffUserId: staffUser.id,
      institutionId: staffUser.institutionId,
      staffRole: staffUser.role
    },
    AUTH_SESSION_CACHE_TTL_SECONDS
  );
};

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getBearerToken(c.req.header("authorization"));

  if (!token) {
    throw new UnauthorizedError("A valid bearer token is required.");
  }

  await resolveAuthenticatedStudent(c, token);
  await next();
};

export const staffAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getBearerToken(c.req.header("authorization"));

  if (!token) {
    throw new UnauthorizedError("A valid bearer token is required.");
  }

  await resolveAuthenticatedStaff(c, token);
  await next();
};

export const optionalAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getBearerToken(c.req.header("authorization"));

  if (!token) {
    await next();
    return;
  }

  await resolveAuthenticatedStudent(c, token);
  await next();
};

export const reviewAccessMiddleware: MiddlewareHandler = async (c, next) => {
  const staffRole = c.get("staffRole");

  if (staffRole !== "reviewer" && staffRole !== "admin") {
    throw new UnauthorizedError("Reviewer access is required.");
  }

  await next();
};

export const adminAccessMiddleware: MiddlewareHandler = async (c, next) => {
  const staffRole = c.get("staffRole");

  if (staffRole !== "admin") {
    throw new UnauthorizedError("Admin access is required.");
  }

  await next();
};
