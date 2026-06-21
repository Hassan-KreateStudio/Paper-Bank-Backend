import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";

export type PdfVisualAnalysis = {
  pageRenderStatus: "rendered" | "failed";
  paperTone: "white" | "non_white" | "unknown";
  whitePixelRatio: number | null;
  hasCenteredHeaderBlock: boolean;
  hasHeaderTextDensity: boolean;
  hasLeftRightMetaRow: boolean;
  looksLikeAssessmentCoverPage: boolean;
};

const failedVisualAnalysis = (): PdfVisualAnalysis => ({
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
    throw new Error(stderr || stdout || `Command failed: ${cmd}`);
  }
};

const isWhitePixel = (red: number, green: number, blue: number) => {
  return (
    red >= 235 &&
    green >= 235 &&
    blue >= 235 &&
    Math.max(red, green, blue) - Math.min(red, green, blue) <= 12
  );
};

const isDarkPixel = (red: number, green: number, blue: number) => {
  return red <= 180 && green <= 180 && blue <= 180;
};

const createRegionDensityReader = (image: PNG) => {
  return (xStartRatio: number, xEndRatio: number, yStartRatio: number, yEndRatio: number) => {
    const xStart = Math.max(0, Math.floor(image.width * xStartRatio));
    const xEnd = Math.min(image.width, Math.ceil(image.width * xEndRatio));
    const yStart = Math.max(0, Math.floor(image.height * yStartRatio));
    const yEnd = Math.min(image.height, Math.ceil(image.height * yEndRatio));
    let darkPixels = 0;
    let sampledPixels = 0;
    const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 500));

    for (let y = yStart; y < yEnd; y += step) {
      for (let x = xStart; x < xEnd; x += step) {
        const index = (image.width * y + x) * 4;
        const red = image.data[index];
        const green = image.data[index + 1];
        const blue = image.data[index + 2];

        sampledPixels += 1;

        if (isDarkPixel(red, green, blue)) {
          darkPixels += 1;
        }
      }
    }

    return sampledPixels === 0 ? 0 : darkPixels / sampledPixels;
  };
};

const analyzePng = async (pngPath: string) => {
  const pngBytes = await readFile(pngPath);
  const image = PNG.sync.read(pngBytes);
  const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 400));
  let sampledPixels = 0;
  let whitePixels = 0;

  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const index = (image.width * y + x) * 4;
      const red = image.data[index];
      const green = image.data[index + 1];
      const blue = image.data[index + 2];

      sampledPixels += 1;

      if (isWhitePixel(red, green, blue)) {
        whitePixels += 1;
      }
    }
  }

  const whitePixelRatio = sampledPixels === 0 ? 1 : whitePixels / sampledPixels;
  const readRegionDensity = createRegionDensityReader(image);
  const topCenterDensity = readRegionDensity(0.3, 0.7, 0.03, 0.3);
  const topLeftDensity = readRegionDensity(0.05, 0.28, 0.03, 0.3);
  const topRightDensity = readRegionDensity(0.72, 0.95, 0.03, 0.3);
  const topCombinedDensity = readRegionDensity(0.08, 0.92, 0.03, 0.34);
  const metaLeftDensity = readRegionDensity(0.08, 0.45, 0.22, 0.5);
  const metaRightDensity = readRegionDensity(0.55, 0.92, 0.22, 0.5);
  const hasCenteredHeaderBlock =
    topCenterDensity >= 0.004 &&
    topCenterDensity >= topLeftDensity * 1.1 &&
    topCenterDensity >= topRightDensity * 1.1;
  const hasHeaderTextDensity = topCombinedDensity >= 0.003;
  const hasLeftRightMetaRow = metaLeftDensity >= 0.0001 && metaRightDensity >= 0.0001;
  const paperTone = whitePixelRatio >= 0.92 ? "white" : "non_white";
  const looksLikeAssessmentCoverPage =
    paperTone === "non_white" &&
    hasCenteredHeaderBlock &&
    hasHeaderTextDensity &&
    hasLeftRightMetaRow;

  return {
    pageRenderStatus: "rendered",
    paperTone,
    whitePixelRatio,
    hasCenteredHeaderBlock,
    hasHeaderTextDensity,
    hasLeftRightMetaRow,
    looksLikeAssessmentCoverPage
  } satisfies PdfVisualAnalysis;
};

export const analyzePdf = async (pdfBytes: ArrayBuffer) => {
  const tempDir = await mkdtemp(join(tmpdir(), "paper-bank-renderer-"));
  const pdfPath = join(tempDir, "upload.pdf");
  const pngPrefix = join(tempDir, "page");
  const pngPath = `${pngPrefix}.png`;

  try {
    await writeFile(pdfPath, Buffer.from(pdfBytes));
    await runCommand(pdftoppmPath, ["-f", "1", "-singlefile", "-png", pdfPath, pngPrefix]);

    if (!existsSync(pngPath)) {
      return failedVisualAnalysis();
    }

    return await analyzePng(pngPath);
  } catch {
    return failedVisualAnalysis();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};
