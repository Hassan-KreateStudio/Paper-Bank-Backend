import { AppError } from "../../lib/errors";

const PDFJS_VERSION = "4.10.38";
const PDFJS_MODULE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const PAGE_SCALE = 1.6;

const PDF_RENDERER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      :root {
        color-scheme: light;
      }

      body {
        margin: 0;
        background: #f3f4f6;
        font-family: Arial, sans-serif;
      }

      #pages {
        display: flex;
        flex-direction: column;
        gap: 24px;
        padding: 24px;
      }

      [data-paperbank-page] {
        align-self: center;
        background: #ffffff;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
        padding: 12px;
      }

      canvas {
        display: block;
        max-width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>
    <main id="pages"></main>
    <script type="module">
      import * as pdfjsLib from "${PDFJS_MODULE_URL}";

      pdfjsLib.GlobalWorkerOptions.workerSrc = "${PDFJS_WORKER_URL}";

      const decodeBase64 = (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }

        return bytes;
      };

      window.renderPaperBankPdf = async (base64) => {
        const root = document.getElementById("pages");
        root.innerHTML = "";

        const documentTask = pdfjsLib.getDocument({
          data: decodeBase64(base64),
          useWorkerFetch: true
        });
        const pdf = await documentTask.promise;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: ${PAGE_SCALE} });
          const wrapper = document.createElement("section");
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("Canvas context could not be created.");
          }

          wrapper.setAttribute("data-paperbank-page", String(pageNumber));
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          wrapper.appendChild(canvas);
          root.appendChild(wrapper);

          await page.render({
            canvasContext: context,
            viewport
          }).promise;
        }

        return { pageCount: pdf.numPages };
      };
    </script>
  </body>
</html>`;

const encodeFileData = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const encodeBytes = (value: Uint8Array | ArrayBuffer) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

export type RenderedPdfPage = {
  pageNumber: number;
  imageBase64: string;
};

type BrowserBinding = {
  fetch: typeof fetch;
};

const renderPdfPagesWithBrowser = async (
  browserBinding: BrowserBinding,
  file: File
): Promise<RenderedPdfPage[]> => {
  const { launch } = await import("@cloudflare/playwright");
  const browser = await launch(browserBinding);

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1400,
        height: 2000
      }
    });

    await page.setContent(PDF_RENDERER_HTML, {
      waitUntil: "load"
    });

    const pdfBase64 = await encodeFileData(file);
    const renderResult = (await page.evaluate(
      async (base64) => {
        const renderer = (globalThis as {
          renderPaperBankPdf?: (value: string) => Promise<{ pageCount: number }>;
        }).renderPaperBankPdf;

        if (!renderer) {
          throw new Error("PDF page renderer is not available.");
        }

        return renderer(base64);
      },
      pdfBase64
    )) as { pageCount?: number } | null;
    const pageCount = Number(renderResult?.pageCount ?? 0);

    if (!Number.isFinite(pageCount) || pageCount <= 0) {
      throw new AppError("The uploaded PDF could not be rendered into review images.", 502);
    }

    const renderedPages: RenderedPdfPage[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const pageImage = await page
        .locator(`[data-paperbank-page="${pageNumber}"]`)
        .screenshot({
          type: "png"
        });

      renderedPages.push({
        pageNumber,
        imageBase64: encodeBytes(pageImage)
      });
    }

    return renderedPages;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("The uploaded PDF could not be rendered into review images.", 502);
  } finally {
    await browser.close();
  }
};

export const pdfRenderer = {
  renderPdfPages: renderPdfPagesWithBrowser
};
