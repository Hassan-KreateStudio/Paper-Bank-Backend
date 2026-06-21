import { papersRepository } from "../../papers/repository";
import { getInstitutionUploadReviewProfile } from "../../institutions/services";
import { uploadsRepository } from "../repository";
import { AppError } from "../../../lib/errors";
import type { EnvBindings } from "../../../lib/app-env";
import { analyzePdfFirstPageVisuals } from "./visual-analysis";

const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024;
const PDF_SIGNATURE = "%PDF-";

const ensurePdfFile = (file: File, fileText: string) => {
  const looksLikePdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf") ||
    fileText.startsWith(PDF_SIGNATURE);

  if (!looksLikePdf) {
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

const decodePdfTextFragment = (fragment: string) => {
  return fragment
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
};

const extractPdfText = (fileText: string) => {
  const fragments = Array.from(fileText.matchAll(/\(([^()]*)\)/g), (match) =>
    decodePdfTextFragment(match[1] ?? "")
  );

  return fragments.join(" ").replace(/\s+/g, " ").trim();
};

const createTextPreview = (text: string) => {
  if (!text) {
    return "";
  }

  return text.slice(0, 280);
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
      return {
        file: {
          name: file.name,
          mimeType: file.type || "application/pdf",
          sizeBytes: file.size,
          hash: fileHash
        },
        extracted: {
          textPreview: "",
          metadata: emptyReview.metadata,
          confidence: emptyReview.confidence
        },
        review: emptyReview,
        duplicateCheck: {
          isDuplicate: false,
          reason: "none" as const,
          matchedPaperId: null,
          matchedSubmissionId: null
        }
      };
    }

    const extractedText = extractPdfText(fileText);
    const review = uploadReviewProfile.reviewUpload(extractedText, visual);

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
  requestUpload: async () => null
};
