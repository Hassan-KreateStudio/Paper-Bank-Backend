import type { EnvBindings } from "../../lib/app-env";
import { AppError } from "../../lib/errors";
import { getUploadReviewModel } from "./config";

const PAPER_BANK_UPLOAD_REVIEW_SYSTEM_INSTRUCTION = `
You are PaperBank's document review and metadata extraction engine.

You will receive:
1. institution-specific review guidance
2. uploaded full-document content extracted from a PDF
3. no guarantee that the scan is clean or perfectly readable

Your job is to:
- determine whether the uploaded document is a valid academic assessment document for the target institution
- classify the likely paper type
- extract the most useful visible metadata
- identify supporting and contradicting signals
- return a strict JSON response only

Rules:
- return JSON only
- do not return markdown
- do not wrap the JSON in code fences
- do not explain your reasoning in prose outside the JSON
- do not invent missing fields
- if a value is not confidently visible, return null
- use the institution-specific guidance as the standard for authenticity
- prefer review over reject when the institutional pattern is visible but some details are unclear
- reject only when the document does not appear to be a valid assessment document for the target institution

Return exactly this JSON shape:

{
  "institution": {
    "expected": string,
    "detected": string | null,
    "matches_expected": boolean,
    "confidence": number
  },
  "document": {
    "is_valid_assessment": boolean,
    "paper_type": "cat" | "exam" | "assignment" | "unknown",
    "confidence": number
  },
  "metadata": {
    "unit_code": string | null,
    "unit_name": string | null,
    "programme": string | null,
    "school": string | null,
    "academic_year": string | null,
    "date": string | null,
    "time": string | null,
    "duration": string | null,
    "page_marker": string | null,
    "title": string | null
  },
  "signals": {
    "header_present": boolean,
    "institution_name_present": boolean,
    "school_or_faculty_present": boolean,
    "programme_present": boolean,
    "unit_code_present": boolean,
    "unit_name_present": boolean,
    "assessment_wording_present": boolean,
    "date_present": boolean,
    "time_or_duration_present": boolean,
    "mark_allocations_present": boolean,
    "page_marker_present": boolean,
    "formal_assessment_layout_present": boolean
  },
  "evidence": {
    "supporting_signals": string[],
    "contradicting_signals": string[]
  },
  "decision": {
    "status": "accept" | "review" | "reject",
    "message": string
  }
}
`.trim();

export type UploadReviewRequest = {
  documentContent: string;
  institutionPrompt: string;
};

export type UploadReviewResponse = {
  raw: unknown;
};

export const reviewUploadDocument = async (
  env: EnvBindings,
  request: UploadReviewRequest
): Promise<UploadReviewResponse> => {
  const ai = env.AI as { run?: (model: string, payload: unknown) => Promise<unknown> } | undefined;

  if (!ai?.run) {
    throw new AppError("Workers AI binding is not configured.", 500);
  }

  const model = getUploadReviewModel(env);

  const raw = await ai.run(model, {
    messages: [
      {
        role: "system",
        content: PAPER_BANK_UPLOAD_REVIEW_SYSTEM_INSTRUCTION
      },
      {
        role: "user",
        content: `Institution upload review standard:\n${request.institutionPrompt}`
      },
      {
        role: "user",
        content: `Uploaded document content:\n${request.documentContent}`
      }
    ]
  });

  return { raw };
};
