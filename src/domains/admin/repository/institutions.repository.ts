import type { AdminInstitutionItem } from "../contracts";

export const adminInstitutionsRepository = {
  list: async (db: D1Database) => {
    const result = await db
      .prepare(
        `
          SELECT
            id,
            name,
            slug,
            short_code AS shortCode,
            email_domain AS emailDomain,
            status,
            upload_review_prompt AS uploadReviewPrompt
          FROM institutions
          ORDER BY name ASC
        `
      )
      .all<AdminInstitutionItem>();

    return result.results;
  }
};
