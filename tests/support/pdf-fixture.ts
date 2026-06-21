import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

type PdfFixtureOptions = {
  name: string;
  pageColor: "white" | "yellow";
  lines?: string[];
  textBlocks?: Array<{
    text: string;
    x: number;
    y: number;
    align?: "left" | "center" | "right";
    fontSize?: number;
  }>;
  imageBlocks?: Array<{
    path: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
};

const getRuntimePath = (relativePath: string) => {
  const home = process.env.HOME;

  if (!home) {
    return null;
  }

  return join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", relativePath);
};

const resolvePythonPath = () => {
  const candidates = [
    process.env.PDF_ANALYZER_PYTHON_PATH ?? "",
    getRuntimePath(join("python", "bin", "python3")) ?? "",
    "python3"
  ];

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

  return "python3";
};

export const createPdfFixture = async ({ name, lines, pageColor, textBlocks, imageBlocks }: PdfFixtureOptions) => {
  const pythonPath = resolvePythonPath();
  const tempDir = await mkdtemp(join(tmpdir(), "paper-bank-pdf-fixture-"));
  const pdfPath = join(tempDir, name);
  const script = `
import json
import sys
from reportlab.lib.colors import Color
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

output_path = sys.argv[1]
payload = json.loads(sys.argv[2])
background = payload["background"]
lines = payload.get("lines", [])
text_blocks = payload.get("textBlocks", [])
image_blocks = payload.get("imageBlocks", [])

pdf = canvas.Canvas(output_path, pagesize=A4, pageCompression=0)
page_width, page_height = A4
pdf.setFillColor(Color(*background))
pdf.rect(0, 0, page_width, page_height, fill=1, stroke=0)
pdf.setFillColorRGB(0, 0, 0)

y = page_height - 72
for line in lines:
    pdf.drawString(72, y, line)
    y -= 24

for block in text_blocks:
    pdf.setFont("Helvetica", block.get("fontSize", 12))
    if block.get("align") == "center":
        pdf.drawCentredString(block["x"], block["y"], block["text"])
    elif block.get("align") == "right":
        pdf.drawRightString(block["x"], block["y"], block["text"])
    else:
        pdf.drawString(block["x"], block["y"], block["text"])

for block in image_blocks:
    pdf.drawImage(
        ImageReader(block["path"]),
        block["x"],
        block["y"],
        width=block["width"],
        height=block["height"],
        mask="auto"
    )

pdf.showPage()
pdf.save()
`;

  const background = pageColor === "yellow" ? [0.96, 0.92, 0.60] : [1.0, 1.0, 1.0];
  const process = Bun.spawn([pythonPath, "-c", script, pdfPath, JSON.stringify({ background, lines, textBlocks, imageBlocks })], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const exitCode = await process.exited;

  if (exitCode !== 0) {
    const errorText = await new Response(process.stderr).text();
    await rm(tempDir, { recursive: true, force: true });
    throw new Error(errorText || "Failed to create PDF fixture.");
  }

  const bytes = await readFile(pdfPath);
  await rm(tempDir, { recursive: true, force: true });

  return new File([bytes], name, {
    type: "application/pdf"
  });
};
