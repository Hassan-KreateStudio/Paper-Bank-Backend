import { PAPER_STATUS } from "../../../lib/constants/paper-status";
import type { EnvBindings } from "../../../lib/app-env";
import { AppError, NotFoundError } from "../../../lib/errors";
import { getPaperFile } from "../../../platform/storage";
import { papersRepository } from "../../papers/repository";
import { searchService } from "../../search/services";
import { uploadsRepository } from "../../uploads/repository";
import { extractPdfTextFromBytes } from "../../uploads/services/pdf-text";
import { reviewRepository } from "../repository";

export const reviewService = {
  reviewQueue: async (db: D1Database, institutionId: string) => {
    return await reviewRepository.queue(db, institutionId);
  },
  approveSubmission: async (
    db: D1Database,
    env: EnvBindings,
    institutionId: string,
    uploadSubmissionId: string,
    reviewerStudentId: string | null,
    notes: string | null
  ) => {
    const submission = await uploadsRepository.findById(db, uploadSubmissionId);

    if (!submission || submission.institutionId !== institutionId) {
      throw new NotFoundError("Upload submission was not found.");
    }

    const existingPaper = await papersRepository.findBySourceUploadSubmissionId(db, submission.id);

    if (existingPaper) {
      return {
        submission,
        paper: existingPaper
      };
    }

    const duplicatePaper = await papersRepository.findByFileHash(db, institutionId, submission.fileHash);

    if (duplicatePaper) {
      throw new AppError("This upload has already been approved into an existing paper.", 409);
    }

    const storedFile = await getPaperFile(env, submission.fileKey);

    if (!storedFile) {
      throw new NotFoundError("Stored upload file was not found.");
    }

    const fileBytes = await storedFile.arrayBuffer();
    const { extractedText } = extractPdfTextFromBytes(fileBytes);

    const paper = await papersRepository.create(db, {
      id: crypto.randomUUID(),
      institutionId: submission.institutionId,
      sourceUploadSubmissionId: submission.id,
      title: submission.title,
      unitCode: submission.unitCode,
      unitName: submission.unitName,
      paperType: submission.paperType,
      academicYear: submission.academicYear,
      status: PAPER_STATUS.available,
      fileKey: submission.fileKey,
      fileHash: submission.fileHash,
      extractedText
    });

    if (!paper) {
      throw new AppError("Failed to create approved paper.", 500);
    }

    const updatedSubmission = await uploadsRepository.updateStatus(db, submission.id, "approved");

    await reviewRepository.createDecision(db, {
      id: crypto.randomUUID(),
      uploadSubmissionId: submission.id,
      reviewerStudentId,
      decision: "approved",
      notes
    });

    await searchService.indexApprovedPaper(db, env, {
      paperId: paper.id,
      institutionId: paper.institutionId,
      extractedText
    });

    return {
      submission: updatedSubmission ?? submission,
      paper
    };
  }
};
