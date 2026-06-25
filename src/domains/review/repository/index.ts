import type { ReviewDecision, ReviewQueueItem } from "../contracts";
import type { UploadRecord } from "../../uploads/contracts";

export const reviewRepository = {
  queue: async (db: D1Database, institutionId: string | null) => {
    const result = institutionId
      ? await db
          .prepare(
            `
              SELECT
                id,
                institution_id AS institutionId,
                student_id AS studentId,
                title,
                unit_code AS unitCode,
                unit_name AS unitName,
                paper_type AS paperType,
                academic_year AS academicYear,
                status,
                created_at AS createdAt
              FROM upload_submissions
              WHERE institution_id = ?1
                AND status IN ('submitted', 'in_review')
              ORDER BY created_at DESC
            `
          )
          .bind(institutionId)
          .all<ReviewQueueItem>()
      : await db
          .prepare(
            `
              SELECT
                id,
                institution_id AS institutionId,
                student_id AS studentId,
                title,
                unit_code AS unitCode,
                unit_name AS unitName,
                paper_type AS paperType,
                academic_year AS academicYear,
                status,
                created_at AS createdAt
              FROM upload_submissions
              WHERE status IN ('submitted', 'in_review')
              ORDER BY created_at DESC
            `
          )
          .all<ReviewQueueItem>();

    return result.results;
  },
  findSubmissionById: async (db: D1Database, uploadSubmissionId: string) => {
    return await db
      .prepare(
        `
          SELECT
            id,
            institution_id AS institutionId,
            student_id AS studentId,
            title,
            unit_code AS unitCode,
            unit_name AS unitName,
            paper_type AS paperType,
            academic_year AS academicYear,
            description,
            file_key AS fileKey,
            file_name AS fileName,
            mime_type AS mimeType,
            file_size_bytes AS fileSizeBytes,
            file_hash AS fileHash,
            model_label AS modelLabel,
            model_confidence AS modelConfidence,
            model_metadata_json AS modelMetadataJson,
            reviewed_by_model_at AS reviewedByModelAt,
            document_fingerprint AS documentFingerprint,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM upload_submissions
          WHERE id = ?1
          LIMIT 1
        `
      )
      .bind(uploadSubmissionId)
      .first<UploadRecord>();
  },
  listDecisionsByUploadSubmissionId: async (db: D1Database, uploadSubmissionId: string) => {
    const result = await db
      .prepare(
        `
          SELECT
            id,
            upload_submission_id AS uploadSubmissionId,
            reviewer_student_id AS reviewerStudentId,
            decision,
            notes,
            created_at AS createdAt
          FROM review_decisions
          WHERE upload_submission_id = ?1
          ORDER BY created_at DESC
        `
      )
      .bind(uploadSubmissionId)
      .all<ReviewDecision>();

    return result.results;
  },
  createDecision: async (
    db: D1Database,
    input: {
      id: string;
      uploadSubmissionId: string;
      reviewerStudentId: string | null;
      decision: string;
      notes: string | null;
    }
  ) => {
    await db
      .prepare(
        `
          INSERT INTO review_decisions (
            id,
            upload_submission_id,
            reviewer_student_id,
            decision,
            notes,
            created_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        `
      )
      .bind(
        input.id,
        input.uploadSubmissionId,
        input.reviewerStudentId,
        input.decision,
        input.notes,
        new Date().toISOString()
      )
      .run();

    const decision = await db
      .prepare(
        `
          SELECT
            id,
            upload_submission_id AS uploadSubmissionId,
            reviewer_student_id AS reviewerStudentId,
            decision,
            notes,
            created_at AS createdAt
          FROM review_decisions
          WHERE id = ?1
          LIMIT 1
        `
      )
      .bind(input.id)
      .first<ReviewDecision>();

    return decision;
  }
};
