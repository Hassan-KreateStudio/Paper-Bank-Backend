import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { requireText } from "../../../lib/validation";
import { requireDb } from "../../../platform/db";
import { rateLimitMiddleware, staffAuthMiddleware } from "../../../middleware";
import { staffAuthRepository } from "../repository";
import { staffAuthService } from "../services";
import { UnauthorizedError } from "../../../lib/errors";

export const staffAuthRoutes = new Hono<AppEnv>();

staffAuthRoutes.use("/login", rateLimitMiddleware);
staffAuthRoutes.use("/activate", rateLimitMiddleware);
staffAuthRoutes.use("/session", staffAuthMiddleware);

staffAuthRoutes.post("/login", async (c) => {
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const db = requireDb(c.env);

  return c.json({
    success: true,
    ...(await staffAuthService.login(
      db,
      {
        username: requireText(payload.username, "username"),
        password: requireText(payload.password, "password")
      },
      c.env
    ))
  });
});

staffAuthRoutes.post("/activate", async (c) => {
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const db = requireDb(c.env);

  return c.json({
    success: true,
    ...(await staffAuthService.activateInvite(
      db,
      {
        inviteId: requireText(payload.inviteId, "inviteId"),
        inviteToken: requireText(payload.inviteToken, "inviteToken"),
        password: requireText(payload.password, "password")
      },
      c.env
    ))
  });
});

staffAuthRoutes.get("/session", async (c) => {
  const db = requireDb(c.env);
  const staffUserId = c.get("staffUserId");

  if (!staffUserId) {
    throw new UnauthorizedError("Authentication is required.");
  }

  const staffUser = await staffAuthRepository.findById(db, staffUserId);

  if (!staffUser) {
    throw new UnauthorizedError("Authenticated staff user was not found.");
  }

  return c.json({
    success: true,
    authenticated: true,
    staffUser: {
      id: staffUser.id,
      institutionId: staffUser.institutionId,
      email: staffUser.email,
      username: staffUser.username,
      role: staffUser.role,
      status: staffUser.status
    }
  });
});
