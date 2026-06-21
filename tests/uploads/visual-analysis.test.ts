import { afterEach, describe, expect, it } from "bun:test";
import { analyzePdfFirstPageVisuals } from "../../src/domains/uploads/services/visual-analysis";

const originalFetch = globalThis.fetch;

describe("pdf first page visual analysis", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses the remote renderer when a renderer url is configured", async () => {
    let capturedRequest: Request | null = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        input instanceof Request ? input.url : input instanceof URL ? input.toString() : input;
      const requestInit = input instanceof Request ? {
        method: input.method,
        headers: input.headers,
        body: input.body ?? undefined
      } : init;

      capturedRequest = new Request(requestUrl, requestInit);

      return new Response(
        JSON.stringify({
          pageRenderStatus: "rendered",
          paperTone: "non_white",
          whitePixelRatio: 0.18
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }) as typeof fetch;

    const analysis = await analyzePdfFirstPageVisuals(
      new TextEncoder().encode("%PDF-1.4 fake").buffer,
      {
        rendererUrl: "https://renderer.example.com/analyze-pdf",
        rendererToken: "renderer-secret"
      }
    );

    const request = capturedRequest as unknown as Request;

    expect(request).toBeDefined();
    expect(request.url).toBe("https://renderer.example.com/analyze-pdf");
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("application/pdf");
    expect(request.headers.get("authorization")).toBe("Bearer renderer-secret");
    expect(analysis).toEqual({
      pageRenderStatus: "rendered",
      paperTone: "non_white",
      whitePixelRatio: 0.18
    });
  });
});
