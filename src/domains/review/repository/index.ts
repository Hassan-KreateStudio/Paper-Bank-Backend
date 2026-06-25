type ReviewQueueItem = {
  id: string;
  institutionId: string;
  studentId: string;
  title: string;
  unitCode: string;
  unitName: string;
  paperType: string;
  academicYear: string | null;
  status: string;
  createdAt: string;
};

export const reviewRepository = {
  queue: async (db: D1Database, institutionId: string) => {
    const result = await db
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
            AND status = 'submitted'
          ORDER BY created_at DESC
        `
      )
      .bind(institutionId)
      .all<ReviewQueueItem>();

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
  }
};
