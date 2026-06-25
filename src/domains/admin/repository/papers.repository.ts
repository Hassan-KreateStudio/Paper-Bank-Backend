import type { AdminPaperItem } from "../contracts";

export const adminPapersRepository = {
  list: async (db: D1Database) => {
    const result = await db
      .prepare(
        `
          SELECT
            papers.id,
            papers.institution_id AS institutionId,
            institutions.name AS institutionName,
            papers.title,
            papers.unit_code AS unitCode,
            papers.unit_name AS unitName,
            papers.paper_type AS paperType,
            papers.academic_year AS academicYear,
            papers.status,
            papers.created_at AS createdAt
          FROM papers
          INNER JOIN institutions
            ON institutions.id = papers.institution_id
          ORDER BY papers.created_at DESC
        `
      )
      .all<AdminPaperItem>();

    return result.results;
  }
};
