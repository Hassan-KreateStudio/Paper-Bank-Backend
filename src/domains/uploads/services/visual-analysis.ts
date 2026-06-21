import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError } from "../../../lib/errors";

export type UploadVisualAnalysis = {
  pageRenderStatus: "rendered" | "failed";
  paperTone: "white" | "non_white" | "unknown";
  whitePixelRatio: number | null;
};

type VisualAnalysisOptions = {
  rendererUrl?: string;
  rendererToken?: string;
};

const failedVisualAnalysis = (): UploadVisualAnalysis => ({
  pageRenderStatus: "failed",
  paperTone: "unknown",
  whitePixelRatio: null
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

for y in range(0, height, step):
    for x in range(0, width, step):
        r, g, b = image.getpixel((x, y))
        sampled_pixels += 1
        if r >= 235 and g >= 235 and b >= 235 and max(r, g, b) - min(r, g, b) <= 12:
            white_pixels += 1

white_ratio = (white_pixels / sampled_pixels) if sampled_pixels else 1.0
paper_tone = "white" if white_ratio >= 0.92 else "non_white"

print(json.dumps({
    "pageRenderStatus": "rendered",
    "paperTone": paper_tone,
    "whitePixelRatio": white_ratio
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
      whitePixelRatio: typeof body.whitePixelRatio === "number" ? body.whitePixelRatio : null
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
