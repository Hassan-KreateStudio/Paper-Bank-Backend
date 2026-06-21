import type { UploadVisualAnalysis } from "../../uploads/services/visual-analysis";

type MetadataConfidence = "high" | "medium" | "low";

type ExtractedMetadata = {
  institutionName: string | null;
  unitCode: string | null;
  unitName: string | null;
  paperType: string | null;
  academicYear: string | null;
};

type ExtractedConfidence = {
  institutionName: MetadataConfidence;
  unitCode: MetadataConfidence;
  unitName: MetadataConfidence;
  paperType: MetadataConfidence;
  academicYear: MetadataConfidence;
};

type ReviewCheckStatus = "pass" | "warn";

export type UploadReviewCheck = {
  code: string;
  status: ReviewCheckStatus;
  message: string;
};

export type UploadReviewResult = {
  documentKind: "strathmore_cat_or_exam" | "not_strathmore_cat_or_exam";
  visual: UploadVisualAnalysis;
  metadata: ExtractedMetadata;
  confidence: ExtractedConfidence;
  checks: UploadReviewCheck[];
  rules: string[];
};

export type InstitutionUploadReviewProfile = {
  institutionId: string;
  reviewRules: string[];
  reviewUpload: (text: string, visual: UploadVisualAnalysis) => UploadReviewResult;
};

const extractLabeledValue = (text: string, label: string) => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(
      `${escapedLabel}:\\s*(.+?)(?=\\s+(?:Unit Code|Unit Name|Paper Type|Academic Year):|$)`,
      "i"
    )
  );

  if (!match?.[1]) {
    return null;
  }

  return match[1].trim();
};

const normalizePaperType = (text: string) => {
  if (/cat/i.test(text)) {
    return "cat";
  }

  if (/exam|end semester/i.test(text)) {
    return "exam";
  }

  if (/assignment/i.test(text)) {
    return "assignment";
  }

  return null;
};

const strathmoreReviewRules = [
  "Document text should mention Strathmore University.",
  "Document should clearly be a CAT or exam.",
  "Unit code should be present as a labeled value or match an uppercase code plus four digits.",
  "Unit name should be present as a labeled value.",
  "Document should include a date.",
  "Document should include a time or duration.",
  "CAT and exam papers should be printed on non-white paper."
];

const strathmoreProfile: InstitutionUploadReviewProfile = {
  institutionId: "inst_strathmore",
  reviewRules: strathmoreReviewRules,
  reviewUpload: (text, visual) => {
    const institutionName = /strathmore university/i.test(text) ? "Strathmore University" : null;
    const labeledUnitCode = extractLabeledValue(text, "Unit Code");
    const unitCode = labeledUnitCode ?? text.match(/\b[A-Z]{2,4}\s?\d{4}\b/)?.[0] ?? null;
    const unitName = extractLabeledValue(text, "Unit Name");
    const labeledPaperType = extractLabeledValue(text, "Paper Type");
    const paperType = normalizePaperType(labeledPaperType ?? text);
    const academicYear = text.match(/\b20\d{2}\s*\/\s*20\d{2}\b/)?.[0]?.replace(/\s+/g, "") ?? null;
    const hasDate = /date:\s*.+/i.test(text);
    const hasTime = /time:\s*.+|duration:\s*.+|1\s*hour|2\s*hours|3\s*hours/i.test(text);
    const isAcceptedAssessmentType = paperType === "cat" || paperType === "exam";
    const hasNonWhitePaper = visual.paperTone === "non_white";
    const isStrathmoreAssessment =
      Boolean(institutionName) &&
      isAcceptedAssessmentType &&
      Boolean(unitCode) &&
      Boolean(unitName) &&
      hasDate &&
      hasTime &&
      hasNonWhitePaper;

    const checks: UploadReviewCheck[] = [
      {
        code: "paper_color_non_white",
        status: hasNonWhitePaper ? "pass" : "warn",
        message: hasNonWhitePaper
          ? "Rendered first page appears to be on non-white paper."
          : visual.pageRenderStatus === "failed"
            ? "First page rendering failed, so paper color could not be verified."
            : "Rendered first page appears to be on white paper."
      },
      {
        code: "institution_match",
        status: institutionName ? "pass" : "warn",
        message: institutionName
          ? "Document mentions Strathmore University."
          : "Document does not clearly mention Strathmore University."
      },
      {
        code: "unit_code_present",
        status: unitCode ? "pass" : "warn",
        message: unitCode ? `Detected unit code ${unitCode}.` : "Unit code was not detected."
      },
      {
        code: "unit_name_present",
        status: unitName ? "pass" : "warn",
        message: unitName ? `Detected unit name ${unitName}.` : "Unit name was not detected."
      },
      {
        code: "assessment_kind_match",
        status: isStrathmoreAssessment ? "pass" : "warn",
        message: isStrathmoreAssessment
          ? "Document matches the Strathmore CAT or exam pattern."
          : "Document is not clearly a Strathmore CAT or exam."
      },
      {
        code: "paper_type_present",
        status: isAcceptedAssessmentType ? "pass" : "warn",
        message: isAcceptedAssessmentType
          ? `Detected paper type ${paperType}.`
          : paperType
            ? `Detected paper type ${paperType}, which is not accepted as a Strathmore CAT or exam.`
            : "Paper type was not detected."
      },
      {
        code: "date_present",
        status: hasDate ? "pass" : "warn",
        message: hasDate ? "Document includes a date." : "Document does not clearly include a date."
      },
      {
        code: "time_present",
        status: hasTime ? "pass" : "warn",
        message: hasTime
          ? "Document includes a time or duration."
          : "Document does not clearly include a time or duration."
      }
    ];

    return {
      documentKind: isStrathmoreAssessment
        ? "strathmore_cat_or_exam"
        : "not_strathmore_cat_or_exam",
      visual,
      metadata: {
        institutionName,
        unitCode,
        unitName,
        paperType,
        academicYear
      },
      confidence: {
        institutionName: institutionName ? "high" : "low",
        unitCode: labeledUnitCode ? "high" : unitCode ? "medium" : "low",
        unitName: unitName ? "high" : "low",
        paperType: labeledPaperType ? "high" : paperType ? "medium" : "low",
        academicYear: academicYear ? "high" : "low"
      },
      checks,
      rules: strathmoreReviewRules
    };
  }
};

export const getInstitutionUploadReviewProfile = (institutionId: string) => {
  if (institutionId === strathmoreProfile.institutionId) {
    return strathmoreProfile;
  }

  return null;
};
