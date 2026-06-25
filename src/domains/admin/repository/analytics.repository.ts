import type { AdminAnalyticsOverview } from "../contracts";

const readCount = async (db: D1Database, sql: string, ...values: string[]) => {
  const result = await db
    .prepare(sql)
    .bind(...values)
    .first<{ count: number }>();

  return Number(result?.count ?? 0);
};

export const adminAnalyticsRepository = {
  overview: async (db: D1Database): Promise<AdminAnalyticsOverview> => {
    const [
      institutions,
      students,
      reviewers,
      admins,
      submittedUploads,
      approvedPapers,
      waitlistEntries
    ] = await Promise.all([
      readCount(db, `SELECT COUNT(*) AS count FROM institutions`),
      readCount(db, `SELECT COUNT(*) AS count FROM students`),
      readCount(db, `SELECT COUNT(*) AS count FROM staff_users WHERE role = ?1`, "reviewer"),
      readCount(db, `SELECT COUNT(*) AS count FROM staff_users WHERE role = ?1`, "admin"),
      readCount(db, `SELECT COUNT(*) AS count FROM upload_submissions WHERE status = ?1`, "submitted"),
      readCount(db, `SELECT COUNT(*) AS count FROM papers WHERE status = ?1`, "available"),
      readCount(db, `SELECT COUNT(*) AS count FROM waitlist_entries`)
    ]);

    return {
      institutions,
      students,
      reviewers,
      admins,
      submittedUploads,
      approvedPapers,
      waitlistEntries
    };
  }
};
