import type { EnvBindings } from "../../lib/app-env";
import { AppError } from "../../lib/errors";
import { pdfRenderer } from "../pdf/render-pdf-pages";

const PAPER_TEXT_EXTRACTION_SYSTEM_INSTRUCTION = `
You are PaperBank's paper text extraction engine.

You will receive page images from a single academic paper PDF.

Your job is to:
- read the paper exactly as it appears
- return the readable text in the same top-to-bottom order
- preserve question numbering, headings, and obvious line breaks when possible

Rules:
- return plain text only
- do not return JSON
- do not return markdown
- do not explain what you are doing
- do not summarize
- do not add commentary
- if some text is unreadable, skip only the unreadable parts and continue with the rest
`.trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readChoiceMessageContent = (choices: unknown): string | null => {
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const firstChoice = choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null;
  }

  const content = firstChoice.message.content;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const textParts = content
    .map((item) => {
      if (!isRecord(item)) {
        return "";
      }

      if (typeof item.text === "string") {
        return item.text;
      }

      return "";
    })
    .filter(Boolean);

  if (textParts.length === 0) {
    return null;
  }

  return textParts.join("\n");
};

const readModelResponseText = (raw: unknown) => {
  if (typeof raw === "string") {
    return raw;
  }

  if (isRecord(raw)) {
    const topLevelChoicesText = readChoiceMessageContent(raw.choices);

    if (topLevelChoicesText) {
      return topLevelChoicesText;
    }
  }

  if (isRecord(raw) && typeof raw.response === "string") {
    return raw.response;
  }

  if (isRecord(raw) && isRecord(raw.result)) {
    if (typeof raw.result.response === "string") {
      return raw.result.response;
    }

    const nestedChoicesText = readChoiceMessageContent(raw.result.choices);

    if (nestedChoicesText) {
      return nestedChoicesText;
    }
  }

  throw new AppError("Approved paper text extraction model did not return text output.", 502);
};

export const extractApprovedPaperText = async (env: EnvBindings, file: File) => {
  const ai = env.AI as { run?: (model: string, payload: unknown) => Promise<unknown> } | undefined;

  if (!ai?.run) {
    throw new AppError("Workers AI binding is not configured.", 500);
  }

  if (!env.BROWSER) {
    throw new AppError("Browser rendering binding is not configured.", 500);
  }

  const renderedPages = await pdfRenderer.renderPdfPages(env.BROWSER, file);
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: "Read all attached PDF page images from the same document and return only the paper text."
    }
  ];

  for (const renderedPage of renderedPages) {
    content.push({
      type: "text",
      text: `PDF page ${renderedPage.pageNumber}`
    });
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${renderedPage.imageBase64}`
      }
    });
  }

  const raw = await ai.run(env.RETRIEVAL_MODEL, {
    messages: [
      {
        role: "system",
        content: PAPER_TEXT_EXTRACTION_SYSTEM_INSTRUCTION
      },
      {
        role: "user",
        content
      }
    ],
    temperature: 0
  });

  const extractedText = readModelResponseText(raw).trim();

  if (!extractedText) {
    throw new AppError("Approved paper text extraction returned empty text.", 502);
  }

  return extractedText;
};

