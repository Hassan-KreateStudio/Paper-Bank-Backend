import { Hono } from "hono";
import type { AppEnv } from "../../../lib/app-env";
import { UnauthorizedError } from "../../../lib/errors";
import { requireDb } from "../../../platform/db";
import { papersService } from "../services";

export const paperRoutes = new Hono<AppEnv>();

paperRoutes.get("/", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");

  if (!institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  const items = await papersService.browse(db, institutionId, c.req.query("query"));

  return c.json({
    domain: "papers",
    items
  });
});

paperRoutes.get("/:paperId", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");

  if (!institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  const paper = await papersService.getPaper(db, institutionId, c.req.param("paperId"));

  return c.json({
    success: true,
    paper
  });
});

paperRoutes.get("/:paperId/file", async (c) => {
  const db = requireDb(c.env);
  const institutionId = c.get("institutionId");

  if (!institutionId) {
    throw new UnauthorizedError("Institution context is required.");
  }

  const { paper, object } = await papersService.getPaperFile(
    db,
    institutionId,
    c.req.param("paperId"),
    c.env
  );

  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType ?? "application/pdf");
  headers.set("content-disposition", `inline; filename="${paper.title}.pdf"`);
  headers.set("etag", paper.fileHash);

  return new Response(object.body, {
    status: 200,
    headers
  });
});
