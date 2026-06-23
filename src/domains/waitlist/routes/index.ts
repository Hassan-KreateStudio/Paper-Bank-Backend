import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { requireText } from "../../../lib/validation";
import { requireDb } from "../../../platform/db";
import { waitlistService } from "../services";

export const waitlistRoutes = new Hono<AppEnv>();

waitlistRoutes.post("/", async (c) => {
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const db = requireDb(c.env);

  await waitlistService.join(db, {
    institutionSlug: requireText(payload.institutionSlug, "institutionSlug"),
    name: requireText(payload.name, "name"),
    email: requireText(payload.email, "email")
  });

  return c.json({
    success: true,
    message: "You have been added to the waitlist."
  });
});
