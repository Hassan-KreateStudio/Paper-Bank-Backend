import { papersRepository } from "../../papers/repository";
import { getInstitutionUploadReviewProfile } from "../../institutions/services";
import { uploadsRepository } from "../repository";
import { AppError } from "../../../lib/errors";
import type { EnvBindings } from "../../../lib/app-env";
import { analyzePdfFirstPageVisuals } from "./visual-analysis";
import { putPaperFile } from "../../../platform/storage";
import { createTextPreview, extractPdfText, looksLikePdf } from "./pdf-text";

const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024;

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

export const uploadsService = {
  buildPrefill: async (db: D1Database, institutionId: string, file: File, env: EnvBindings) => {
    const fileBytes = await file.arrayBuffer();
    const fileText = new TextDecoder().decode(fileBytes);
    const uploadReviewProfile = getInstitutionUploadReviewProfile(institutionId);

    ensurePdfFile(file, fileText);

    if (!uploadReviewProfile) {
      throw new AppError("No upload review profile is configured for this institution.", 400);
    }

    const fileHash = await createFileHash(fileBytes);
    const visual = await analyzePdfFirstPageVisuals(fileBytes, {
      rendererUrl: env.PDF_RENDERER_URL,
      rendererToken: env.PDF_RENDERER_TOKEN
    });
    const emptyReview = uploadReviewProfile.reviewUpload("", visual);

    if (visual.paperTone === "white") {
      throw new AppError(
        emptyReview.documentFailureMessage ??
          "This PDF does not appear to be a valid institution assessment document.",
        422
      );
    }

    const extractedText = extractPdfText(fileText);
    const review = uploadReviewProfile.reviewUpload(extractedText, visual);

    if (review.documentKind !== "strathmore_cat_or_exam") {
      throw new AppError(
        review.documentFailureMessage ??
          "This PDF does not appear to be a valid institution assessment document.",
        422
      );
    }

    const matchedPaperByHash = await papersRepository.findByFileHash(db, institutionId, fileHash);

    if (matchedPaperByHash) {
      return {
        file: {
          name: file.name,
          mimeType: file.type || "application/pdf",
          sizeBytes: file.size,
          hash: fileHash
        },
        extracted: {
          textPreview: createTextPreview(extractedText),
          metadata: review.metadata,
          confidence: review.confidence
        },
        review,
        duplicateCheck: {
          isDuplicate: true,
          reason: "file_hash" as const,
          matchedPaperId: matchedPaperByHash.id,
          matchedSubmissionId: null
        }
      };
    }

    const matchedSubmissionByHash = await uploadsRepository.findByFileHash(db, institutionId, fileHash);

    if (matchedSubmissionByHash) {
      return {
        file: {
          name: file.name,
          mimeType: file.type || "application/pdf",
          sizeBytes: file.size,
          hash: fileHash
        },
        extracted: {
          textPreview: createTextPreview(extractedText),
          metadata: review.metadata,
          confidence: review.confidence
        },
        review,
        duplicateCheck: {
          isDuplicate: true,
          reason: "file_hash" as const,
          matchedPaperId: null,
          matchedSubmissionId: matchedSubmissionByHash.id
        }
      };
    }

    if (review.metadata.unitCode && review.metadata.paperType && review.metadata.academicYear) {
      const matchedPaperByMetadata = await papersRepository.findByMetadata(
        db,
        institutionId,
        review.metadata.unitCode,
        review.metadata.paperType,
        review.metadata.academicYear
      );

      if (matchedPaperByMetadata) {
        return {
          file: {
            name: file.name,
            mimeType: file.type || "application/pdf",
            sizeBytes: file.size,
            hash: fileHash
          },
          extracted: {
            textPreview: createTextPreview(extractedText),
            metadata: review.metadata,
            confidence: review.confidence
          },
          review,
          duplicateCheck: {
            isDuplicate: true,
            reason: "metadata" as const,
            matchedPaperId: matchedPaperByMetadata.id,
            matchedSubmissionId: null
          }
        };
      }

      const matchedSubmissionByMetadata = await uploadsRepository.findByMetadata(
        db,
        institutionId,
        review.metadata.unitCode,
        review.metadata.paperType,
        review.metadata.academicYear
      );

      if (matchedSubmissionByMetadata) {
        return {
          file: {
            name: file.name,
            mimeType: file.type || "application/pdf",
            sizeBytes: file.size,
            hash: fileHash
          },
          extracted: {
            textPreview: createTextPreview(extractedText),
            metadata: review.metadata,
            confidence: review.confidence
          },
          review,
          duplicateCheck: {
            isDuplicate: true,
            reason: "metadata" as const,
            matchedPaperId: null,
            matchedSubmissionId: matchedSubmissionByMetadata.id
          }
        };
      }
    }

    return {
      file: {
        name: file.name,
        mimeType: file.type || "application/pdf",
        sizeBytes: file.size,
        hash: fileHash
      },
      extracted: {
        textPreview: createTextPreview(extractedText),
        metadata: review.metadata,
        confidence: review.confidence
      },
      review,
      duplicateCheck: {
        isDuplicate: false,
        reason: "none" as const,
        matchedPaperId: null,
        matchedSubmissionId: null
      }
    };
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
