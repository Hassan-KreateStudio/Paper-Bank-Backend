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

uploadRoutes.post("/confirm", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");
  const studentId = c.get("studentId");
  const formData = await c.req.formData();
  const upload = formData.get("file");

  if (!institutionId || !studentId) {
    throw new UnauthorizedError("Authenticated student context is required.");
  }

  if (!(upload instanceof File)) {
    throw new AppError("A pdf file is required.", 400);
  }

  const confirmation = await uploadsService.confirmUpload(
    db,
    institutionId,
    studentId,
    upload,
    {
      title: formData.get("title")?.toString(),
      unitCode: formData.get("unitCode")?.toString(),
      unitName: formData.get("unitName")?.toString(),
      paperType: formData.get("paperType")?.toString(),
      academicYear: formData.get("academicYear")?.toString(),
      description: formData.get("description")?.toString()
    },
    c.env
  );

  return c.json({
    success: true,
    ...confirmation
  });
});
