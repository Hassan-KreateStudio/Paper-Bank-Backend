import { Hono } from "hono";
import { analyzePdf } from "./visual-analysis";

const app = new Hono();

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

const requireRendererToken = (request: Request) => {
  const expectedToken = process.env.RENDERER_AUTH_TOKEN ?? "";

  if (!expectedToken) {
    return false;
  }

  return getBearerToken(request.headers.get("authorization") ?? undefined) === expectedToken;
};

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "paper-bank-renderer"
  });
});

app.post("/analyze-pdf", async (c) => {
  if (!requireRendererToken(c.req.raw)) {
    return c.json(
      {
        success: false,
        message: "A valid renderer bearer token is required."
      },
      401
    );
  }

  const pdfBytes = await c.req.arrayBuffer();

  if (pdfBytes.byteLength === 0) {
    return c.json(
      {
        success: false,
        message: "A pdf body is required."
      },
      400
    );
  }

  const analysis = await analyzePdf(pdfBytes);

  return c.json(analysis);
});

const port = Number(process.env.PORT ?? "3010");

export default app;

if (import.meta.main) {
  Bun.serve({
    fetch: app.fetch,
    port
  });

  console.log(`paper-bank-renderer listening on ${port}`);
}
