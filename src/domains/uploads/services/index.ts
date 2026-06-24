import { NotFoundError, AppError } from "../../../lib/errors";
import type { EnvBindings } from "../../../lib/app-env";
import { reviewUploadDocument, type UploadReviewResult } from "../../../platform/ai/review";
import { institutionsRepository } from "../../institutions/repository";
import { papersRepository } from "../../papers/repository";
import {
  normalizeDocumentFingerprint,
  type NormalizedAssessmentType
} from "./document-fingerprint";
import { uploadsRepository } from "../repository";
import { putPaperFile } from "../../../platform/storage";

const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024;
const PDF_SIGNATURE = "%PDF-";

const looksLikePdf = (file: File, fileText: string) => {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf") ||
    fileText.startsWith(PDF_SIGNATURE)
  );
};

const ensurePdfFile = (file: File, fileText: string) => {
  if (!looksLikePdf(file, fileText)) {
    throw new AppError("A pdf file is required.", 400);
  }

  if (file.size === 0) {
    throw new AppError("The uploaded pdf file is empty.", 400);
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new AppError("The uploaded pdf file is too large.", 400);
  }
};

const createFileHash = async (fileBytes: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", fileBytes);

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const buildUploadTitle = (unitName: string, paperType: string, academicYear: string) => {
  const normalizedPaperType = paperType.trim().toUpperCase();
  return `${unitName.trim()} ${normalizedPaperType} ${academicYear.trim()}`.trim();
};

const sanitizePathSegment = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const requireConfirmField = (value: string | null | undefined, label: string) => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new AppError(`${label} is required.`, 400);
  }

  return normalizedValue;
};

const optionalConfirmField = (value: string | null | undefined) => {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : null;
};

const optionalConfirmNumber = (value: string | null | undefined, label: string) => {
  const normalizedValue = optionalConfirmField(value);

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isFinite(parsedValue)) {
    throw new AppError(`${label} must be a valid number.`, 400);
  }

  return parsedValue;
};

const mapExtractedPaperType = (paperType: UploadReviewResult["document"]["paperType"]) => {
  if (paperType === "unknown") {
    return "other" as const;
  }

  return paperType;
};

const createPrefillPayload = ({ file, fileHash, duplicateCheck, review, documentIdentity }: {
  file: File;
  fileHash: string;
  duplicateCheck: {
    isDuplicate: boolean;
    reason: "none" | "file_hash" | "document_fingerprint";
    matchedPaperId: string | null;
    matchedSubmissionId: string | null;
  };
  review: UploadReviewResult;
  documentIdentity: {
    unitCode: string | null;
    assessmentType: NormalizedAssessmentType;
    assessmentDate: string | null;
    assessmentNumber: string | null;
    documentFingerprint: string | null;
    isFingerprintReady: boolean;
  };
}) => ({
  file: {
    name: file.name,
    mimeType: file.type || "application/pdf",
    sizeBytes: file.size,
    hash: fileHash
  },
  modelReview: {
    label: review.decision.status,
    confidence: review.document.confidence,
    evidence: review.evidence.supportingSignals,
    warnings: review.evidence.contradictingSignals
  },
  extracted: {
    institutionName: review.institution.detected,
    unitCode: review.metadata.unitCode,
    unitName: review.metadata.unitName,
    paperType: mapExtractedPaperType(review.document.paperType),
    assessmentDate: review.metadata.date,
    academicYear: review.metadata.academicYear,
    assessmentNumber: documentIdentity.assessmentNumber,
    title: review.metadata.title
  },
  documentFingerprint: documentIdentity.documentFingerprint,
  duplicateCheck
});

const createManualReviewDecision = (
  review: UploadReviewResult,
  message: string
): UploadReviewResult => ({
  ...review,
  decision: {
    status: "review",
    message
  }
});

const ensureSupportedAssessmentType = (
  assessmentType: NormalizedAssessmentType,
  institutionName: string
) => {
  if (assessmentType === "cat" || assessmentType === "exam") {
    return;
  }

  throw new AppError(
    `This document does not appear to be a valid ${institutionName} CAT or exam paper. Please upload a correct assessment document.`,
    422
  );
};

export const uploadsService = {
  buildPrefill: async (db: D1Database, institutionId: string, file: File, env: EnvBindings) => {
    const fileBytes = await file.arrayBuffer();
    const fileText = new TextDecoder().decode(fileBytes);

    ensurePdfFile(file, fileText);

    const fileHash = await createFileHash(fileBytes);
    const matchedPaperByHash = await papersRepository.findByFileHash(db, institutionId, fileHash);

    if (matchedPaperByHash) {
      throw new AppError("This PDF already exists in PaperBank as an approved paper.", 409);
    }

    const institution = await institutionsRepository.findById(db, institutionId);

    if (!institution) {
      throw new NotFoundError("Institution was not found.");
    }

    const institutionPrompt = institution.uploadReviewPrompt?.trim();

    if (!institutionPrompt) {
      throw new AppError("Upload review prompt is not configured for this institution.", 500);
    }

    const review = await reviewUploadDocument(env, {
      file,
      institutionPrompt
    });

    if (review.decision.status === "reject") {
      throw new AppError(review.decision.message, 422);
    }

    const documentIdentity = normalizeDocumentFingerprint({
      institutionId,
      unitCode: review.metadata.unitCode,
      paperType: review.document.paperType,
      date: review.metadata.date,
      title: review.metadata.title
    });

    ensureSupportedAssessmentType(documentIdentity.assessmentType, institution.name);

    const fingerprintReady = Boolean(documentIdentity.documentFingerprint);
    const effectiveReview = fingerprintReady
      ? review
      : createManualReviewDecision(
          review,
          "We found a likely valid assessment paper, but some details could not be extracted confidently yet. Please review the extracted metadata before continuing."
        );

    if (documentIdentity.documentFingerprint) {
      const matchedPaperByFingerprint = await papersRepository.findByDocumentFingerprint(
        db,
        institutionId,
        documentIdentity.documentFingerprint
      );

      if (matchedPaperByFingerprint) {
        throw new AppError(
          "This assessment paper already exists in PaperBank as an approved paper.",
          409
        );
      }
    }

    return createPrefillPayload({
      file,
      fileHash,
      duplicateCheck: {
        isDuplicate: false,
        reason: "none" as const,
        matchedPaperId: null,
        matchedSubmissionId: null
      },
      review: effectiveReview,
      documentIdentity: {
        ...documentIdentity,
        isFingerprintReady: fingerprintReady
      }
    });
  },
  confirmUpload: async (
    db: D1Database,
    institutionId: string,
    studentId: string,
    file: File,
    input: {
      unitCode: string | null | undefined;
      unitName: string | null | undefined;
      paperType: string | null | undefined;
      academicYear: string | null | undefined;
      title?: string | null | undefined;
      description?: string | null | undefined;
      modelLabel?: string | null | undefined;
      modelConfidence?: string | null | undefined;
      modelMetadataJson?: string | null | undefined;
      reviewedByModelAt?: string | null | undefined;
      documentFingerprint?: string | null | undefined;
    },
    env: EnvBindings
  ) => {
    const fileBytes = await file.arrayBuffer();
    const fileText = new TextDecoder().decode(fileBytes);

    ensurePdfFile(file, fileText);

    const unitCode = requireConfirmField(input.unitCode, "Unit code");
    const unitName = requireConfirmField(input.unitName, "Unit name");
    const paperType = requireConfirmField(input.paperType, "Paper type").toLowerCase();
    const academicYear = requireConfirmField(input.academicYear, "Academic year");
    const title = input.title?.trim() || buildUploadTitle(unitName, paperType, academicYear);
    const description = input.description?.trim() || null;
    const modelLabel = optionalConfirmField(input.modelLabel);
    const modelConfidence = optionalConfirmNumber(input.modelConfidence, "Model confidence");
    const modelMetadataJson = optionalConfirmField(input.modelMetadataJson);
    const reviewedByModelAt = optionalConfirmField(input.reviewedByModelAt);
    const documentFingerprint = optionalConfirmField(input.documentFingerprint);
    const fileHash = await createFileHash(fileBytes);

    const matchedPaperByHash = await papersRepository.findByFileHash(db, institutionId, fileHash);

    if (matchedPaperByHash) {
      throw new AppError("This PDF already exists as an approved paper.", 409);
    }

    const matchedSubmissionByHash = await uploadsRepository.findByFileHash(db, institutionId, fileHash);

    if (matchedSubmissionByHash) {
      throw new AppError("This PDF has already been submitted.", 409);
    }

    const submissionId = crypto.randomUUID();
    const fileKey = [
      institutionId,
      "upload-submissions",
      submissionId,
      sanitizePathSegment(file.name.replace(/\.pdf$/i, "")) || "paper"
    ].join("/") + ".pdf";

    await putPaperFile(env, fileKey, fileBytes, {
      httpMetadata: {
        contentType: file.type || "application/pdf",
        contentDisposition: `inline; filename="${file.name}"`
      },
      customMetadata: {
        institutionId,
        studentId,
        kind: "upload_submission"
      }
    });

    const submission = await uploadsRepository.create(db, {
      id: submissionId,
      institutionId,
      studentId,
      title,
      unitCode,
      unitName,
      paperType,
      academicYear,
      description,
      fileKey,
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      fileSizeBytes: file.size,
      fileHash,
      modelLabel,
      modelConfidence,
      modelMetadataJson,
      reviewedByModelAt,
      documentFingerprint,
      status: "submitted"
    });

    if (!submission) {
      throw new AppError("Failed to create upload submission.", 500);
    }

    return {
      submission
    };
  },
  requestUpload: async () => null
};
