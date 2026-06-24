import type { EnvBindings } from "../../lib/app-env";
import { AppError } from "../../lib/errors";
import { getUploadReviewModel } from "./config";

const PAPER_BANK_UPLOAD_REVIEW_SYSTEM_INSTRUCTION = `
You are PaperBank's document review and metadata extraction engine.

You will receive:
1. institution-specific review guidance
2. an uploaded PDF document
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

const UPLOAD_REVIEW_JSON_SCHEMA = {
  type: "object",
  required: ["institution", "document", "metadata", "signals", "evidence", "decision"],
  properties: {
    institution: {
      type: "object",
      required: ["expected", "detected", "matches_expected", "confidence"],
      properties: {
        expected: { type: "string" },
        detected: { type: ["string", "null"] },
        matches_expected: { type: "boolean" },
        confidence: { type: "number" }
      }
    },
    document: {
      type: "object",
      required: ["is_valid_assessment", "paper_type", "confidence"],
      properties: {
        is_valid_assessment: { type: "boolean" },
        paper_type: { type: "string", enum: ["cat", "exam", "assignment", "unknown"] },
        confidence: { type: "number" }
      }
    },
    metadata: {
      type: "object",
      required: [
        "unit_code",
        "unit_name",
        "programme",
        "school",
        "academic_year",
        "date",
        "time",
        "duration",
        "page_marker",
        "title"
      ],
      properties: {
        unit_code: { type: ["string", "null"] },
        unit_name: { type: ["string", "null"] },
        programme: { type: ["string", "null"] },
        school: { type: ["string", "null"] },
        academic_year: { type: ["string", "null"] },
        date: { type: ["string", "null"] },
        time: { type: ["string", "null"] },
        duration: { type: ["string", "null"] },
        page_marker: { type: ["string", "null"] },
        title: { type: ["string", "null"] }
      }
    },
    signals: {
      type: "object",
      required: [
        "header_present",
        "institution_name_present",
        "school_or_faculty_present",
        "programme_present",
        "unit_code_present",
        "unit_name_present",
        "assessment_wording_present",
        "date_present",
        "time_or_duration_present",
        "mark_allocations_present",
        "page_marker_present",
        "formal_assessment_layout_present"
      ],
      properties: {
        header_present: { type: "boolean" },
        institution_name_present: { type: "boolean" },
        school_or_faculty_present: { type: "boolean" },
        programme_present: { type: "boolean" },
        unit_code_present: { type: "boolean" },
        unit_name_present: { type: "boolean" },
        assessment_wording_present: { type: "boolean" },
        date_present: { type: "boolean" },
        time_or_duration_present: { type: "boolean" },
        mark_allocations_present: { type: "boolean" },
        page_marker_present: { type: "boolean" },
        formal_assessment_layout_present: { type: "boolean" }
      }
    },
    evidence: {
      type: "object",
      required: ["supporting_signals", "contradicting_signals"],
      properties: {
        supporting_signals: { type: "array", items: { type: "string" } },
        contradicting_signals: { type: "array", items: { type: "string" } }
      }
    },
    decision: {
      type: "object",
      required: ["status", "message"],
      properties: {
        status: { type: "string", enum: ["accept", "review", "reject"] },
        message: { type: "string" }
      }
    }
  }
} as const;

export type UploadReviewRequest = {
  file: File;
  institutionPrompt: string;
};

export type UploadReviewResult = {
  institution: {
    expected: string;
    detected: string | null;
    matchesExpected: boolean;
    confidence: number;
  };
  document: {
    isValidAssessment: boolean;
    paperType: "cat" | "exam" | "assignment" | "unknown";
    confidence: number;
  };
  metadata: {
    unitCode: string | null;
    unitName: string | null;
    programme: string | null;
    school: string | null;
    academicYear: string | null;
    date: string | null;
    time: string | null;
    duration: string | null;
    pageMarker: string | null;
    title: string | null;
  };
  signals: {
    headerPresent: boolean;
    institutionNamePresent: boolean;
    schoolOrFacultyPresent: boolean;
    programmePresent: boolean;
    unitCodePresent: boolean;
    unitNamePresent: boolean;
    assessmentWordingPresent: boolean;
    datePresent: boolean;
    timeOrDurationPresent: boolean;
    markAllocationsPresent: boolean;
    pageMarkerPresent: boolean;
    formalAssessmentLayoutPresent: boolean;
  };
  evidence: {
    supportingSignals: string[];
    contradictingSignals: string[];
  };
  decision: {
    status: "accept" | "review" | "reject";
    message: string;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const expectRecord = (value: unknown, label: string) => {
  if (!isRecord(value)) {
    throw new AppError(`Upload review model returned an invalid ${label} object.`, 502);
  }

  return value;
};

const expectString = (value: unknown, label: string) => {
  if (typeof value !== "string") {
    throw new AppError(`Upload review model returned an invalid ${label}.`, 502);
  }

  return value;
};

const readNullableString = (value: unknown, label: string) => {
  if (value === null) {
    return null;
  }

  return expectString(value, label);
};

const expectBoolean = (value: unknown, label: string) => {
  if (typeof value !== "boolean") {
    throw new AppError(`Upload review model returned an invalid ${label}.`, 502);
  }

  return value;
};

const expectNumber = (value: unknown, label: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AppError(`Upload review model returned an invalid ${label}.`, 502);
  }

  return value;
};

const expectStringArray = (value: unknown, label: string) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AppError(`Upload review model returned an invalid ${label}.`, 502);
  }

  return value;
};

const expectPaperType = (value: unknown) => {
  if (value === "cat" || value === "exam" || value === "assignment" || value === "unknown") {
    return value;
  }

  throw new AppError("Upload review model returned an invalid document.paper_type.", 502);
};

const expectDecisionStatus = (value: unknown) => {
  if (value === "accept" || value === "review" || value === "reject") {
    return value;
  }

  throw new AppError("Upload review model returned an invalid decision.status.", 502);
};

const extractJsonText = (text: string) => {
  try {
    JSON.parse(text);
    return text;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      throw new AppError("Upload review model returned invalid JSON.", 502);
    }

    const candidate = text.slice(firstBrace, lastBrace + 1);

    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      throw new AppError("Upload review model returned invalid JSON.", 502);
    }
  }
};

const readModelResponseText = (raw: unknown) => {
  if (typeof raw === "string") {
    return raw;
  }

  if (isRecord(raw) && typeof raw.response === "string") {
    return raw.response;
  }

  throw new AppError("Upload review model did not return text output.", 502);
};

const validateUploadReviewResult = (raw: unknown): UploadReviewResult => {
  const parsed = JSON.parse(extractJsonText(readModelResponseText(raw)));
  const root = expectRecord(parsed, "root");
  const institution = expectRecord(root.institution, "institution");
  const document = expectRecord(root.document, "document");
  const metadata = expectRecord(root.metadata, "metadata");
  const signals = expectRecord(root.signals, "signals");
  const evidence = expectRecord(root.evidence, "evidence");
  const decision = expectRecord(root.decision, "decision");

  return {
    institution: {
      expected: expectString(institution.expected, "institution.expected"),
      detected: readNullableString(institution.detected, "institution.detected"),
      matchesExpected: expectBoolean(institution.matches_expected, "institution.matches_expected"),
      confidence: expectNumber(institution.confidence, "institution.confidence")
    },
    document: {
      isValidAssessment: expectBoolean(
        document.is_valid_assessment,
        "document.is_valid_assessment"
      ),
      paperType: expectPaperType(document.paper_type),
      confidence: expectNumber(document.confidence, "document.confidence")
    },
    metadata: {
      unitCode: readNullableString(metadata.unit_code, "metadata.unit_code"),
      unitName: readNullableString(metadata.unit_name, "metadata.unit_name"),
      programme: readNullableString(metadata.programme, "metadata.programme"),
      school: readNullableString(metadata.school, "metadata.school"),
      academicYear: readNullableString(metadata.academic_year, "metadata.academic_year"),
      date: readNullableString(metadata.date, "metadata.date"),
      time: readNullableString(metadata.time, "metadata.time"),
      duration: readNullableString(metadata.duration, "metadata.duration"),
      pageMarker: readNullableString(metadata.page_marker, "metadata.page_marker"),
      title: readNullableString(metadata.title, "metadata.title")
    },
    signals: {
      headerPresent: expectBoolean(signals.header_present, "signals.header_present"),
      institutionNamePresent: expectBoolean(
        signals.institution_name_present,
        "signals.institution_name_present"
      ),
      schoolOrFacultyPresent: expectBoolean(
        signals.school_or_faculty_present,
        "signals.school_or_faculty_present"
      ),
      programmePresent: expectBoolean(signals.programme_present, "signals.programme_present"),
      unitCodePresent: expectBoolean(signals.unit_code_present, "signals.unit_code_present"),
      unitNamePresent: expectBoolean(signals.unit_name_present, "signals.unit_name_present"),
      assessmentWordingPresent: expectBoolean(
        signals.assessment_wording_present,
        "signals.assessment_wording_present"
      ),
      datePresent: expectBoolean(signals.date_present, "signals.date_present"),
      timeOrDurationPresent: expectBoolean(
        signals.time_or_duration_present,
        "signals.time_or_duration_present"
      ),
      markAllocationsPresent: expectBoolean(
        signals.mark_allocations_present,
        "signals.mark_allocations_present"
      ),
      pageMarkerPresent: expectBoolean(signals.page_marker_present, "signals.page_marker_present"),
      formalAssessmentLayoutPresent: expectBoolean(
        signals.formal_assessment_layout_present,
        "signals.formal_assessment_layout_present"
      )
    },
    evidence: {
      supportingSignals: expectStringArray(
        evidence.supporting_signals,
        "evidence.supporting_signals"
      ),
      contradictingSignals: expectStringArray(
        evidence.contradicting_signals,
        "evidence.contradicting_signals"
      )
    },
    decision: {
      status: expectDecisionStatus(decision.status),
      message: expectString(decision.message, "decision.message")
    }
  };
};

const encodeFileData = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

export const reviewUploadDocument = async (
  env: EnvBindings,
  request: UploadReviewRequest
): Promise<UploadReviewResult> => {
  const ai = env.AI as { run?: (model: string, payload: unknown) => Promise<unknown> } | undefined;

  if (!ai?.run) {
    throw new AppError("Workers AI binding is not configured.", 500);
  }

  const model = getUploadReviewModel(env);
  const fileData = await encodeFileData(request.file);

  const raw = await ai.run(model, {
    messages: [
      {
        role: "system",
        content: PAPER_BANK_UPLOAD_REVIEW_SYSTEM_INSTRUCTION
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Institution upload review standard:\n${request.institutionPrompt}\n\nReview the attached PDF document and return the required JSON only.`
          },
          {
            type: "file",
            file: {
              file_data: fileData,
              filename: request.file.name
            }
          }
        ]
      }
    ],
    guided_json: UPLOAD_REVIEW_JSON_SCHEMA,
    temperature: 0
  });

  return validateUploadReviewResult(raw);
};
