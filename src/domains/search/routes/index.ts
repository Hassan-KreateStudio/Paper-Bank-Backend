import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { UnauthorizedError } from "../../../lib/errors";
import { requireDb } from "../../../platform/db";
import { searchService } from "../services";

export const searchRoutes = new Hono<AppEnv>();

searchRoutes.post("/", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");
  const payload = (await c.req.json().catch(() => ({}))) as {
    query?: string;
  };

  if (!institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  const search = await searchService.runHybridSearch(
    db,
    c.env,
    institutionId,
    payload.query?.toString() ?? ""
  );

  return c.json({
    domain: "search",
    ...search
  });
});
