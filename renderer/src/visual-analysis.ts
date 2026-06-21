import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";

export type PdfVisualAnalysis = {
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

type RasterImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

const failedVisualAnalysis = (): PdfVisualAnalysis => ({
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
const strathmoreHeaderAssetPath = join(process.cwd(), "renderer", "assets", "strathmore-header.png");

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

const createRegionDensityReader = (image: RasterImage) => {
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

const resizeImage = (image: RasterImage, width: number, height: number): RasterImage => {
  const data = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x / width) * image.width));
      const sourceY = Math.min(image.height - 1, Math.floor((y / height) * image.height));
      const sourceIndex = (image.width * sourceY + sourceX) * 4;
      const targetIndex = (width * y + x) * 4;

      data[targetIndex] = image.data[sourceIndex];
      data[targetIndex + 1] = image.data[sourceIndex + 1];
      data[targetIndex + 2] = image.data[sourceIndex + 2];
      data[targetIndex + 3] = image.data[sourceIndex + 3];
    }
  }

  return { width, height, data };
};

const cropImage = (
  image: RasterImage,
  xStartRatio: number,
  xEndRatio: number,
  yStartRatio: number,
  yEndRatio: number
): RasterImage => {
  const xStart = Math.max(0, Math.floor(image.width * xStartRatio));
  const xEnd = Math.min(image.width, Math.ceil(image.width * xEndRatio));
  const yStart = Math.max(0, Math.floor(image.height * yStartRatio));
  const yEnd = Math.min(image.height, Math.ceil(image.height * yEndRatio));
  const width = Math.max(1, xEnd - xStart);
  const height = Math.max(1, yEnd - yStart);
  const data = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (image.width * (yStart + y) + (xStart + x)) * 4;
      const targetIndex = (width * y + x) * 4;

      data[targetIndex] = image.data[sourceIndex];
      data[targetIndex + 1] = image.data[sourceIndex + 1];
      data[targetIndex + 2] = image.data[sourceIndex + 2];
      data[targetIndex + 3] = image.data[sourceIndex + 3];
    }
  }

  return { width, height, data };
};

const detectBackgroundColor = (image: RasterImage) => {
  const samplePoints = [
    [0, 0],
    [image.width - 1, 0],
    [0, image.height - 1],
    [image.width - 1, image.height - 1]
  ];
  let red = 0;
  let green = 0;
  let blue = 0;

  for (const [x, y] of samplePoints) {
    const index = (image.width * y + x) * 4;
    red += image.data[index];
    green += image.data[index + 1];
    blue += image.data[index + 2];
  }

  return {
    red: red / samplePoints.length,
    green: green / samplePoints.length,
    blue: blue / samplePoints.length
  };
};

const buildReferenceMask = (image: RasterImage) => {
  const resizedImage = resizeImage(image, 96, 96);

  return Array.from({ length: resizedImage.width * resizedImage.height }, (_, index) => {
    const offset = index * 4;
    return resizedImage.data[offset + 3] >= 32 ? 1 : 0;
  });
};

const buildRenderedMask = (image: RasterImage) => {
  const resizedImage = resizeImage(image, 96, 96);
  const background = detectBackgroundColor(resizedImage);

  return Array.from({ length: resizedImage.width * resizedImage.height }, (_, index) => {
    const offset = index * 4;
    const red = resizedImage.data[offset];
    const green = resizedImage.data[offset + 1];
    const blue = resizedImage.data[offset + 2];
    const distance = Math.sqrt(
      (red - background.red) ** 2 +
      (green - background.green) ** 2 +
      (blue - background.blue) ** 2
    );

    return distance >= 55 || isDarkPixel(red, green, blue) ? 1 : 0;
  });
};

const compareMasks = (referenceMask: number[], renderedMask: number[]) => {
  let matchingForeground = 0;
  let referenceForeground = 0;

  for (let index = 0; index < referenceMask.length; index += 1) {
    if (referenceMask[index] === 1) {
      referenceForeground += 1;

      if (renderedMask[index] === 1) {
        matchingForeground += 1;
      }
    }
  }

  return referenceForeground === 0 ? 0 : matchingForeground / referenceForeground;
};

const analyzeHeaderBranding = async (image: RasterImage) => {
  if (!existsSync(strathmoreHeaderAssetPath)) {
    return {
      hasStrathmoreHeaderBranding: false,
      headerBrandingSimilarityScore: null
    };
  }

  const referencePngBytes = await readFile(strathmoreHeaderAssetPath);
  const referenceImage = PNG.sync.read(referencePngBytes);
  const headerCrop = cropImage(image, 0.34, 0.66, 0.06, 0.24);
  const referenceMask = buildReferenceMask(referenceImage);
  const renderedMask = buildRenderedMask(headerCrop);
  const headerBrandingSimilarityScore = compareMasks(referenceMask, renderedMask);

  return {
    hasStrathmoreHeaderBranding: headerBrandingSimilarityScore >= 0.5,
    headerBrandingSimilarityScore
  };
};

const analyzePng = async (pngPath: string) => {
  const pngBytes = await readFile(pngPath);
  const image = PNG.sync.read(pngBytes);
  const headerBranding = await analyzeHeaderBranding(image);
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
    headerBranding.hasStrathmoreHeaderBranding &&
    hasCenteredHeaderBlock &&
    hasHeaderTextDensity &&
    hasLeftRightMetaRow;

  return {
    pageRenderStatus: "rendered",
    paperTone,
    whitePixelRatio,
    hasStrathmoreHeaderBranding: headerBranding.hasStrathmoreHeaderBranding,
    headerBrandingSimilarityScore: headerBranding.headerBrandingSimilarityScore,
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
