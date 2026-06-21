import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { AppError, UnauthorizedError } from "../../../lib/errors";
import { requireDb } from "../../../platform/db";
import { uploadsService } from "../services";

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.post("/prefill", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");
  const formData = await c.req.formData();
  const upload = formData.get("file");

  if (!institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  if (!(upload instanceof File)) {
    throw new AppError("A pdf file is required.", 400);
  }

  const prefill = await uploadsService.buildPrefill(db, institutionId, upload, c.env);

  return c.json({
    success: true,
    ...prefill
  });
});
