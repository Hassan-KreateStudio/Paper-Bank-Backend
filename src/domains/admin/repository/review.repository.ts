import type { AdminReviewQueueItem } from "../contracts";

export const adminReviewRepository = {
  queue: async (db: D1Database) => {
    const result = await db
      .prepare(
        `
          SELECT
            upload_submissions.id,
            upload_submissions.institution_id AS institutionId,
            institutions.name AS institutionName,
            upload_submissions.student_id AS studentId,
            upload_submissions.title,
            upload_submissions.unit_code AS unitCode,
            upload_submissions.unit_name AS unitName,
            upload_submissions.paper_type AS paperType,
            upload_submissions.academic_year AS academicYear,
            upload_submissions.status,
            upload_submissions.created_at AS createdAt
          FROM upload_submissions
          INNER JOIN institutions
            ON institutions.id = upload_submissions.institution_id
          WHERE upload_submissions.status = 'submitted'
          ORDER BY upload_submissions.created_at DESC
        `
      )
      .all<AdminReviewQueueItem>();

    return result.results;
  }
};
