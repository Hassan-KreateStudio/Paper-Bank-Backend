import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError } from "../../../lib/errors";

export type UploadVisualAnalysis = {
  pageRenderStatus: "rendered" | "failed";
  paperTone: "white" | "non_white" | "unknown";
  whitePixelRatio: number | null;
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
  hasCenteredHeaderBlock: false,
  hasHeaderTextDensity: false,
  hasLeftRightMetaRow: false,
  looksLikeAssessmentCoverPage: false
});

const resolveExecutable = (candidates: string[]) => {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (!candidate.includes("/")) {
      return candidate;
    }

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1] ?? "";
};

const getRuntimePath = (relativePath: string) => {
  const home = process.env.HOME;

  if (!home) {
    return null;
  }

  return join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", relativePath);
};

const pdftoppmPath = resolveExecutable([
  process.env.PDFTOPPM_PATH ?? "",
  getRuntimePath(join("bin", "pdftoppm")) ?? "",
  "pdftoppm"
]);

const pythonPath = resolveExecutable([
  process.env.PDF_ANALYZER_PYTHON_PATH ?? "",
  getRuntimePath(join("python", "bin", "python3")) ?? "",
  "python3"
]);

const readCommandOutput = async (stream: ReadableStream<Uint8Array> | null) => {
  if (!stream) {
    return "";
  }

  return await new Response(stream).text();
};

const runCommand = async (cmd: string, args: string[]) => {
  const process = Bun.spawn([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    readCommandOutput(process.stdout),
    readCommandOutput(process.stderr),
    process.exited
  ]);

  if (exitCode !== 0) {
    throw new AppError(stderr || stdout || `Command failed: ${cmd}`, 500);
  }

  return stdout;
};

const analyzeRenderedPage = async (pngPath: string) => {
  const script = `
import json
import sys
from PIL import Image

image = Image.open(sys.argv[1]).convert("RGB")
width, height = image.size
step = max(1, min(width, height) // 400)
white_pixels = 0
sampled_pixels = 0

def region_density(x_start_ratio, x_end_ratio, y_start_ratio, y_end_ratio):
    x_start = max(0, int(width * x_start_ratio))
    x_end = min(width, int(width * x_end_ratio))
    y_start = max(0, int(height * y_start_ratio))
    y_end = min(height, int(height * y_end_ratio))
    region_step = max(1, min(width, height) // 500)
    dark_pixels = 0
    sampled = 0

    for y in range(y_start, y_end, region_step):
        for x in range(x_start, x_end, region_step):
            r, g, b = image.getpixel((x, y))
            sampled += 1
            if r <= 180 and g <= 180 and b <= 180:
                dark_pixels += 1

    return (dark_pixels / sampled) if sampled else 0

for y in range(0, height, step):
    for x in range(0, width, step):
        r, g, b = image.getpixel((x, y))
        sampled_pixels += 1
        if r >= 235 and g >= 235 and b >= 235 and max(r, g, b) - min(r, g, b) <= 12:
            white_pixels += 1

white_ratio = (white_pixels / sampled_pixels) if sampled_pixels else 1.0
paper_tone = "white" if white_ratio >= 0.92 else "non_white"
top_center_density = region_density(0.3, 0.7, 0.03, 0.3)
top_left_density = region_density(0.05, 0.28, 0.03, 0.3)
top_right_density = region_density(0.72, 0.95, 0.03, 0.3)
top_combined_density = region_density(0.08, 0.92, 0.03, 0.34)
meta_left_density = region_density(0.08, 0.45, 0.22, 0.5)
meta_right_density = region_density(0.55, 0.92, 0.22, 0.5)
has_centered_header_block = (
    top_center_density >= 0.004 and
    top_center_density >= top_left_density * 1.1 and
    top_center_density >= top_right_density * 1.1
)
has_header_text_density = top_combined_density >= 0.003
has_left_right_meta_row = meta_left_density >= 0.0001 and meta_right_density >= 0.0001
looks_like_assessment_cover_page = (
    paper_tone == "non_white" and
    has_centered_header_block and
    has_header_text_density and
    has_left_right_meta_row
)

print(json.dumps({
    "pageRenderStatus": "rendered",
    "paperTone": paper_tone,
    "whitePixelRatio": white_ratio,
    "hasCenteredHeaderBlock": has_centered_header_block,
    "hasHeaderTextDensity": has_header_text_density,
    "hasLeftRightMetaRow": has_left_right_meta_row,
    "looksLikeAssessmentCoverPage": looks_like_assessment_cover_page
}))
`;

  const stdout = await runCommand(pythonPath, ["-c", script, pngPath]);

  return JSON.parse(stdout) as UploadVisualAnalysis;
};

const analyzeLocally = async (fileBytes: ArrayBuffer) => {
  const tempDir = await mkdtemp(join(tmpdir(), "paper-bank-upload-"));
  const pdfPath = join(tempDir, "upload.pdf");
  const pngPrefix = join(tempDir, "page");
  const pngPath = `${pngPrefix}.png`;

  try {
    await writeFile(pdfPath, Buffer.from(fileBytes));
    await runCommand(pdftoppmPath, ["-f", "1", "-singlefile", "-png", pdfPath, pngPrefix]);

    if (!existsSync(pngPath)) {
      return failedVisualAnalysis();
    }

    return await analyzeRenderedPage(pngPath);
  } catch {
    return failedVisualAnalysis();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

const analyzeWithRemoteRenderer = async (
  fileBytes: ArrayBuffer,
  rendererUrl: string,
  rendererToken?: string
) => {
  try {
    const response = await fetch(rendererUrl, {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        ...(rendererToken ? { authorization: `Bearer ${rendererToken}` } : {})
      },
      body: fileBytes
    });

    if (!response.ok) {
      return failedVisualAnalysis();
    }

    const body = (await response.json()) as Partial<UploadVisualAnalysis>;

    if (
      body.pageRenderStatus !== "rendered" &&
      body.pageRenderStatus !== "failed"
    ) {
      return failedVisualAnalysis();
    }

    if (
      body.paperTone !== "white" &&
      body.paperTone !== "non_white" &&
      body.paperTone !== "unknown"
    ) {
      return failedVisualAnalysis();
    }

    return {
      pageRenderStatus: body.pageRenderStatus,
      paperTone: body.paperTone,
      whitePixelRatio: typeof body.whitePixelRatio === "number" ? body.whitePixelRatio : null,
      hasCenteredHeaderBlock: body.hasCenteredHeaderBlock === true,
      hasHeaderTextDensity: body.hasHeaderTextDensity === true,
      hasLeftRightMetaRow: body.hasLeftRightMetaRow === true,
      looksLikeAssessmentCoverPage: body.looksLikeAssessmentCoverPage === true
    } satisfies UploadVisualAnalysis;
  } catch {
    return failedVisualAnalysis();
  }
};

export const analyzePdfFirstPageVisuals = async (
  fileBytes: ArrayBuffer,
  options?: VisualAnalysisOptions
) => {
  if (options?.rendererUrl) {
    return await analyzeWithRemoteRenderer(fileBytes, options.rendererUrl, options.rendererToken);
  }

  return await analyzeLocally(fileBytes);
};
