import { AppError } from "../../../lib/errors";

export type UploadVisualAnalysis = {
  pageRenderStatus: "rendered" | "failed";
  paperTone: "white" | "non_white" | "unknown";
  whitePixelRatio: number | null;
  hasStrathmoreHeaderBranding: boolean;
  headerBrandingSimilarityScore: number | null;
  hasCenteredHeaderBlock: boolean;
  hasHeaderTextDensity: boolean;
  hasLeftRightMetaRow: boolean;
  looksLikeAssessmentCoverPage: boolean;
};

type VisualAnalysisOptions = {
  rendererUrl?: string;
  rendererToken?: string;
};

const failedVisualAnalysis = (): UploadVisualAnalysis => ({
  pageRenderStatus: "failed",
  paperTone: "unknown",
  whitePixelRatio: null,
  hasStrathmoreHeaderBranding: false,
  headerBrandingSimilarityScore: null,
  hasCenteredHeaderBlock: false,
  hasHeaderTextDensity: false,
  hasLeftRightMetaRow: false,
  looksLikeAssessmentCoverPage: false
});

const parseRendererResponse = (body: Partial<UploadVisualAnalysis>) => {
  if (body.pageRenderStatus !== "rendered" && body.pageRenderStatus !== "failed") {
    return failedVisualAnalysis();
  }

  if (body.paperTone !== "white" && body.paperTone !== "non_white" && body.paperTone !== "unknown") {
    return failedVisualAnalysis();
  }

  return {
    pageRenderStatus: body.pageRenderStatus,
    paperTone: body.paperTone,
    whitePixelRatio: typeof body.whitePixelRatio === "number" ? body.whitePixelRatio : null,
    hasStrathmoreHeaderBranding: body.hasStrathmoreHeaderBranding === true,
    headerBrandingSimilarityScore:
      typeof body.headerBrandingSimilarityScore === "number" ? body.headerBrandingSimilarityScore : null,
    hasCenteredHeaderBlock: body.hasCenteredHeaderBlock === true,
    hasHeaderTextDensity: body.hasHeaderTextDensity === true,
    hasLeftRightMetaRow: body.hasLeftRightMetaRow === true,
    looksLikeAssessmentCoverPage: body.looksLikeAssessmentCoverPage === true
  } satisfies UploadVisualAnalysis;
};

export const analyzePdfFirstPageVisuals = async (
  fileBytes: ArrayBuffer,
  options?: VisualAnalysisOptions
) => {
  if (!options?.rendererUrl) {
    throw new AppError("PDF renderer URL is not configured.", 500);
  }

  try {
    const response = await fetch(options.rendererUrl, {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        ...(options.rendererToken ? { authorization: `Bearer ${options.rendererToken}` } : {})
      },
      body: fileBytes
    });

    if (!response.ok) {
      return failedVisualAnalysis();
    }

    const body = (await response.json()) as Partial<UploadVisualAnalysis>;
    return parseRendererResponse(body);
  } catch {
    return failedVisualAnalysis();
  }
};
