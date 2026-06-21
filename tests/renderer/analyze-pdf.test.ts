import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../../renderer/src/index";
import { createPdfFixture } from "../support/pdf-fixture";

const originalToken = process.env.RENDERER_AUTH_TOKEN;

describe("renderer analyze pdf route", () => {
  beforeEach(() => {
    process.env.RENDERER_AUTH_TOKEN = "renderer-secret";
  });

  afterEach(() => {
    process.env.RENDERER_AUTH_TOKEN = originalToken;
  });

  it("rejects requests without a valid bearer token", async () => {
    const response = await app.request("/analyze-pdf", {
      method: "POST",
      body: new TextEncoder().encode("%PDF-1.4 fake")
    });
    const body = (await response.json()) as { success: boolean; message: string };

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toContain("renderer bearer token");
  });

  it("returns non_white for a yellow first page", async () => {
    const file = await createPdfFixture({
      name: "yellow-exam.pdf",
      pageColor: "yellow",
      textBlocks: [
        { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
        { text: "School of Computing and Engineering Sciences", x: 297, y: 720, align: "center", fontSize: 14 },
        { text: "Unit Code: BIT 2205", x: 297, y: 690, align: "center", fontSize: 14 },
        { text: "Paper Type: End Semester Exam", x: 297, y: 660, align: "center", fontSize: 14 },
        { text: "Date: 11th May 2026", x: 72, y: 610, align: "left", fontSize: 13 },
        { text: "Time: 1 Hour", x: 520, y: 610, align: "right", fontSize: 13 }
      ]
    });

    const response = await app.request("/analyze-pdf", {
      method: "POST",
      headers: {
        authorization: "Bearer renderer-secret",
        "content-type": "application/pdf"
      },
      body: await file.arrayBuffer()
    });
    const body = (await response.json()) as {
      pageRenderStatus: string;
      paperTone: string;
      whitePixelRatio: number | null;
      hasCenteredHeaderBlock: boolean;
      hasHeaderTextDensity: boolean;
      hasLeftRightMetaRow: boolean;
      looksLikeAssessmentCoverPage: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.pageRenderStatus).toBe("rendered");
    expect(body.paperTone).toBe("non_white");
    expect(body.whitePixelRatio).toBeNumber();
    expect(body.hasCenteredHeaderBlock).toBe(true);
    expect(body.hasHeaderTextDensity).toBe(true);
    expect(body.hasLeftRightMetaRow).toBe(true);
    expect(body.looksLikeAssessmentCoverPage).toBe(true);
  }, 15000);

  it("returns white for a white first page", async () => {
    const file = await createPdfFixture({
      name: "white-exam.pdf",
      pageColor: "white",
      textBlocks: [
        { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
        { text: "School of Computing and Engineering Sciences", x: 297, y: 720, align: "center", fontSize: 14 },
        { text: "Unit Code: BIT 2205", x: 297, y: 690, align: "center", fontSize: 14 },
        { text: "Paper Type: End Semester Exam", x: 297, y: 660, align: "center", fontSize: 14 },
        { text: "Date: 11th May 2026", x: 72, y: 610, align: "left", fontSize: 13 },
        { text: "Time: 1 Hour", x: 520, y: 610, align: "right", fontSize: 13 }
      ]
    });

    const response = await app.request("/analyze-pdf", {
      method: "POST",
      headers: {
        authorization: "Bearer renderer-secret",
        "content-type": "application/pdf"
      },
      body: await file.arrayBuffer()
    });
    const body = (await response.json()) as {
      pageRenderStatus: string;
      paperTone: string;
      whitePixelRatio: number | null;
      hasCenteredHeaderBlock: boolean;
      hasHeaderTextDensity: boolean;
      hasLeftRightMetaRow: boolean;
      looksLikeAssessmentCoverPage: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.pageRenderStatus).toBe("rendered");
    expect(body.paperTone).toBe("white");
    expect(body.whitePixelRatio).toBeNumber();
    expect(body.hasCenteredHeaderBlock).toBe(true);
    expect(body.hasHeaderTextDensity).toBe(true);
    expect(body.hasLeftRightMetaRow).toBe(true);
    expect(body.looksLikeAssessmentCoverPage).toBe(false);
  }, 15000);
});
