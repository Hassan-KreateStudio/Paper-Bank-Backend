import { PAPER_STATUS } from "../../../lib/constants/paper-status";
import type { EnvBindings } from "../../../lib/app-env";
import { AppError, NotFoundError } from "../../../lib/errors";
import { getPaperFile } from "../../../platform/storage";
import type { Paper } from "../../papers/contracts";
import { papersRepository } from "../../papers/repository";
import { searchService } from "../../search/services";
import type { UploadRecord } from "../../uploads/contracts";
import { uploadsRepository } from "../../uploads/repository";
import { reviewRepository } from "../repository";
import type { StaffRole } from "../../staff-auth/contracts";

const decodePdfTextFragment = (fragment: string) => {
  return fragment
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
};

const extractPdfTextFromBytes = (fileBytes: ArrayBuffer) => {
  const fileText = new TextDecoder().decode(fileBytes);
  const fragments = Array.from(fileText.matchAll(/\(([^()]*)\)/g), (match) =>
    decodePdfTextFragment(match[1] ?? "")
  );

  return fragments.join(" ").replace(/\s+/g, " ").trim();
};

type ReviewScope = {
  institutionId: string | null;
  staffRole: StaffRole;
};

const canAccessSubmission = (scope: ReviewScope, submission: UploadRecord) => {
  return scope.staffRole === "admin" || submission.institutionId === scope.institutionId;
};

const canAccessPaper = (scope: ReviewScope, paper: Paper) => {
  return scope.staffRole === "admin" || paper.institutionId === scope.institutionId;
};

const requireAccessibleSubmission = async (
  db: D1Database,
  scope: ReviewScope,
  uploadSubmissionId: string
) => {
  const submission = await reviewRepository.findSubmissionById(db, uploadSubmissionId);

  if (!submission || !canAccessSubmission(scope, submission)) {
    throw new NotFoundError("Upload submission was not found.");
  }

  return submission;
};

const requireAccessiblePaper = async (db: D1Database, scope: ReviewScope, paperId: string) => {
  const paper = await papersRepository.findById(db, paperId);

  if (!paper || !canAccessPaper(scope, paper)) {
    throw new NotFoundError("Paper was not found.");
  }

  return paper;
};

export const reviewService = {
  reviewQueue: async (db: D1Database, scope: ReviewScope) => {
    return await reviewRepository.queue(
      db,
      scope.staffRole === "admin" ? null : scope.institutionId
    );
  },
  getSubmission: async (db: D1Database, scope: ReviewScope, uploadSubmissionId: string) => {
    const submission = await requireAccessibleSubmission(db, scope, uploadSubmissionId);
    const decisions = await reviewRepository.listDecisionsByUploadSubmissionId(db, uploadSubmissionId);

    return {
      submission,
      decisions
    };
  },
  getSubmissionFile: async (
    db: D1Database,
    env: EnvBindings,
    scope: ReviewScope,
    uploadSubmissionId: string
  ) => {
    const submission = await requireAccessibleSubmission(db, scope, uploadSubmissionId);
    const file = await getPaperFile(env, submission.fileKey);

    if (!file) {
      throw new NotFoundError("Stored upload file was not found.");
    }

    return {
      submission,
      file
    };
  },
  approveSubmission: async (
    db: D1Database,
    env: EnvBindings,
    scope: ReviewScope,
    uploadSubmissionId: string,
    reviewerStudentId: string | null,
    notes: string | null
  ) => {
    const submission = await requireAccessibleSubmission(db, scope, uploadSubmissionId);

    const existingPaper = await papersRepository.findBySourceUploadSubmissionId(db, submission.id);

    if (existingPaper) {
      return {
        submission,
        paper: existingPaper
      };
    }

    const duplicatePaper = await papersRepository.findByFileHash(
      db,
      submission.institutionId,
      submission.fileHash
    );

    if (duplicatePaper) {
      throw new AppError("This upload has already been approved into an existing paper.", 409);
    }

    const storedFile = await getPaperFile(env, submission.fileKey);

    if (!storedFile) {
      throw new NotFoundError("Stored upload file was not found.");
    }

    const fileBytes = await storedFile.arrayBuffer();
    const extractedText = extractPdfTextFromBytes(fileBytes);

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
      documentFingerprint: submission.documentFingerprint,
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
  },
  rejectSubmission: async (
    db: D1Database,
    scope: ReviewScope,
    uploadSubmissionId: string,
    reviewerStudentId: string | null,
    notes: string | null
  ) => {
    const submission = await requireAccessibleSubmission(db, scope, uploadSubmissionId);
    const updatedSubmission = await uploadsRepository.updateStatus(db, submission.id, "rejected");
    const decision = await reviewRepository.createDecision(db, {
      id: crypto.randomUUID(),
      uploadSubmissionId: submission.id,
      reviewerStudentId,
      decision: "rejected",
      notes
    });

    return {
      submission: updatedSubmission ?? submission,
      decision
    };
  },
  holdSubmission: async (
    db: D1Database,
    scope: ReviewScope,
    uploadSubmissionId: string,
    reviewerStudentId: string | null,
    notes: string | null
  ) => {
    const submission = await requireAccessibleSubmission(db, scope, uploadSubmissionId);
    const updatedSubmission = await uploadsRepository.updateStatus(db, submission.id, "in_review");
    const decision = await reviewRepository.createDecision(db, {
      id: crypto.randomUUID(),
      uploadSubmissionId: submission.id,
      reviewerStudentId,
      decision: "in_review",
      notes
    });

    return {
      submission: updatedSubmission ?? submission,
      decision
    };
  },
  listPapers: async (db: D1Database, scope: ReviewScope) => {
    if (scope.staffRole === "admin") {
      throw new AppError("Admin paper browsing should use the admin control surface.", 400);
    }

    if (!scope.institutionId) {
      throw new AppError("Institution context is required.", 401);
    }

    return await papersRepository.listForReview(db, scope.institutionId);
  },
  getPaper: async (db: D1Database, scope: ReviewScope, paperId: string) => {
    return {
      paper: await requireAccessiblePaper(db, scope, paperId)
    };
  },
  getPaperFile: async (db: D1Database, env: EnvBindings, scope: ReviewScope, paperId: string) => {
    const paper = await requireAccessiblePaper(db, scope, paperId);
    const file = await getPaperFile(env, paper.fileKey);

    if (!file) {
      throw new NotFoundError("Approved paper file was not found.");
    }

    return {
      paper,
      file
    };
  },
  archivePaper: async (
    db: D1Database,
    scope: ReviewScope,
    paperId: string,
    reviewerStudentId: string | null,
    notes: string | null
  ) => {
    const paper = await requireAccessiblePaper(db, scope, paperId);
    const archivedPaper = await papersRepository.updateStatus(db, paper.id, PAPER_STATUS.archived);

    if (!archivedPaper) {
      throw new AppError("Failed to archive paper.", 500);
    }

    if (paper.sourceUploadSubmissionId) {
      await reviewRepository.createDecision(db, {
        id: crypto.randomUUID(),
        uploadSubmissionId: paper.sourceUploadSubmissionId,
        reviewerStudentId,
        decision: "archived",
        notes
      });
    }

    return {
      paper: archivedPaper
    };
  }
};
