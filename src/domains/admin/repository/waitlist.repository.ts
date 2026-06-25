import type { AdminWaitlistItem } from "../contracts";

export const adminWaitlistRepository = {
  list: async (db: D1Database) => {
    const result = await db
      .prepare(
        `
          SELECT
            waitlist_entries.id,
            waitlist_entries.institution_id AS institutionId,
            institutions.name AS institutionName,
            waitlist_entries.name,
            waitlist_entries.email,
            waitlist_entries.created_at AS createdAt
          FROM waitlist_entries
          INNER JOIN institutions
            ON institutions.id = waitlist_entries.institution_id
          ORDER BY waitlist_entries.created_at DESC
        `
      )
      .all<AdminWaitlistItem>();

    return result.results;
  }
};
