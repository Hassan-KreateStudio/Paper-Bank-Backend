const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12"
};

export type NormalizedAssessmentType = "cat" | "exam" | "assignment" | "unknown";

export type NormalizedDocumentFingerprint = {
  unitCode: string | null;
  assessmentType: NormalizedAssessmentType;
  assessmentDate: string | null;
  assessmentNumber: string | null;
  documentFingerprint: string | null;
};

const normalizeText = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

export const normalizeUnitCode = (value: string | null | undefined) => {
  const normalized = normalizeText(value).replace(/[^a-z0-9]/g, "");
  return normalized || null;
};

export const normalizeAssessmentType = (
  value: string | null | undefined
): NormalizedAssessmentType => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "unknown";
  }

  if (
    /\bc\.?\s*a\.?\s*t\b/.test(normalized) ||
    normalized.includes("continuous assessment test") ||
    normalized.includes("class assessment test") ||
    normalized.includes("class assessment")
  ) {
    return "cat";
  }

  if (
    normalized.includes("end of semester examination") ||
    normalized.includes("end semester exam") ||
    normalized.includes("final exam") ||
    normalized.includes("main examination") ||
    /\bexam\b/.test(normalized) ||
    normalized.includes("examination")
  ) {
    return "exam";
  }

  if (normalized.includes("assignment") || normalized.includes("coursework")) {
    return "assignment";
  }

  return "unknown";
};

const toIsoDate = (year: string, month: string, day: string) =>
  `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

export const normalizeAssessmentDate = (value: string | null | undefined) => {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const isoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (isoMatch) {
    return toIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  const dayFirstMatch = normalized.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/i
  );

  if (dayFirstMatch) {
    const month = MONTHS[dayFirstMatch[2].toLowerCase()];

    if (month) {
      return toIsoDate(dayFirstMatch[3], month, dayFirstMatch[1]);
    }
  }

  const monthFirstMatch = normalized.match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})$/i
  );

  if (monthFirstMatch) {
    const month = MONTHS[monthFirstMatch[1].toLowerCase()];

    if (month) {
      return toIsoDate(monthFirstMatch[3], month, monthFirstMatch[2]);
    }
  }

  return null;
};

export const normalizeAssessmentNumber = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const normalized = normalizeText(value);

    if (!normalized) {
      continue;
    }

    const match = normalized.match(
      /\b(?:c\.?\s*a\.?\s*t|continuous assessment test|class assessment test|class assessment|exam|examination|assignment)\b[^0-9]{0,12}(\d{1,2})\b/i
    );

    if (match) {
      return match[1];
    }
  }

  return null;
};

export const buildDocumentFingerprint = ({
  institutionId,
  unitCode,
  assessmentType,
  assessmentDate,
  assessmentNumber
}: {
  institutionId: string;
  unitCode: string | null;
  assessmentType: NormalizedAssessmentType;
  assessmentDate: string | null;
  assessmentNumber: string | null;
}) => {
  if (!unitCode || !assessmentDate) {
    return null;
  }

  if (assessmentType !== "cat" && assessmentType !== "exam") {
    return null;
  }

  return [
    institutionId,
    unitCode,
    assessmentType,
    assessmentDate,
    assessmentNumber ?? "unknown"
  ].join("|");
};

export const normalizeDocumentFingerprint = ({
  institutionId,
  unitCode,
  paperType,
  date,
  title
}: {
  institutionId: string;
  unitCode: string | null | undefined;
  paperType: string | null | undefined;
  date: string | null | undefined;
  title?: string | null | undefined;
}): NormalizedDocumentFingerprint => {
  const normalizedUnitCode = normalizeUnitCode(unitCode);
  const normalizedAssessmentType = normalizeAssessmentType(paperType);
  const normalizedAssessmentDate = normalizeAssessmentDate(date);
  const normalizedAssessmentNumber = normalizeAssessmentNumber(paperType, title);

  return {
    unitCode: normalizedUnitCode,
    assessmentType: normalizedAssessmentType,
    assessmentDate: normalizedAssessmentDate,
    assessmentNumber: normalizedAssessmentNumber,
    documentFingerprint: buildDocumentFingerprint({
      institutionId,
      unitCode: normalizedUnitCode,
      assessmentType: normalizedAssessmentType,
      assessmentDate: normalizedAssessmentDate,
      assessmentNumber: normalizedAssessmentNumber
    })
  };
};
