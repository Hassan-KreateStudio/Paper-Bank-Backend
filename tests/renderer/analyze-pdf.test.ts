import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { app } from "../../renderer/src/index";
import { createPdfFixture } from "../support/pdf-fixture";

const originalToken = process.env.RENDERER_AUTH_TOKEN;
const strathmoreHeaderAssetPath = join(process.cwd(), "renderer", "assets", "strathmore-header.png");

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
      imageBlocks: [
        {
          path: strathmoreHeaderAssetPath,
          x: 212,
          y: 650,
          width: 170,
          height: 130
        }
      ],
      textBlocks: [
        { text: "School of Computing and Engineering Sciences", x: 297, y: 600, align: "center", fontSize: 14 },
        { text: "Unit Code: BIT 2205", x: 297, y: 570, align: "center", fontSize: 14 },
        { text: "Paper Type: End Semester Exam", x: 297, y: 540, align: "center", fontSize: 14 },
        { text: "Date: 11th May 2026", x: 72, y: 500, align: "left", fontSize: 13 },
        { text: "Time: 1 Hour", x: 520, y: 500, align: "right", fontSize: 13 }
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
      hasStrathmoreHeaderBranding: boolean;
      headerBrandingSimilarityScore: number | null;
      hasCenteredHeaderBlock: boolean;
      hasHeaderTextDensity: boolean;
      hasLeftRightMetaRow: boolean;
      looksLikeAssessmentCoverPage: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.pageRenderStatus).toBe("rendered");
    expect(body.paperTone).toBe("non_white");
    expect(body.whitePixelRatio).toBeNumber();
    expect(body.hasStrathmoreHeaderBranding).toBe(true);
    expect(body.headerBrandingSimilarityScore).toBeNumber();
    expect(body.hasCenteredHeaderBlock).toBe(true);
    expect(body.hasHeaderTextDensity).toBe(true);
    expect(body.hasLeftRightMetaRow).toBe(true);
    expect(body.looksLikeAssessmentCoverPage).toBe(true);
  }, 15000);

  it("returns white for a white first page", async () => {
    const file = await createPdfFixture({
      name: "white-exam.pdf",
      pageColor: "white",
      imageBlocks: [
        {
          path: strathmoreHeaderAssetPath,
          x: 212,
          y: 650,
          width: 170,
          height: 130
        }
      ],
      textBlocks: [
        { text: "School of Computing and Engineering Sciences", x: 297, y: 600, align: "center", fontSize: 14 },
        { text: "Unit Code: BIT 2205", x: 297, y: 570, align: "center", fontSize: 14 },
        { text: "Paper Type: End Semester Exam", x: 297, y: 540, align: "center", fontSize: 14 },
        { text: "Date: 11th May 2026", x: 72, y: 500, align: "left", fontSize: 13 },
        { text: "Time: 1 Hour", x: 520, y: 500, align: "right", fontSize: 13 }
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
      hasStrathmoreHeaderBranding: boolean;
      headerBrandingSimilarityScore: number | null;
      hasCenteredHeaderBlock: boolean;
      hasHeaderTextDensity: boolean;
      hasLeftRightMetaRow: boolean;
      looksLikeAssessmentCoverPage: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.pageRenderStatus).toBe("rendered");
    expect(body.paperTone).toBe("white");
    expect(body.whitePixelRatio).toBeNumber();
    expect(body.hasStrathmoreHeaderBranding).toBe(true);
    expect(body.headerBrandingSimilarityScore).toBeNumber();
    expect(body.hasCenteredHeaderBlock).toBe(true);
    expect(body.hasHeaderTextDensity).toBe(true);
    expect(body.hasLeftRightMetaRow).toBe(true);
    expect(body.looksLikeAssessmentCoverPage).toBe(false);
  }, 15000);

  it("does not mark a page as Strathmore branded when the header image is missing", async () => {
    const file = await createPdfFixture({
      name: "text-only-exam.pdf",
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
      hasStrathmoreHeaderBranding: boolean;
      looksLikeAssessmentCoverPage: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.hasStrathmoreHeaderBranding).toBe(false);
    expect(body.looksLikeAssessmentCoverPage).toBe(false);
  }, 15000);
});
