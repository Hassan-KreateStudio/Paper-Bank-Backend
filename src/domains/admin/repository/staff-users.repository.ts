import type { StaffUser } from "../../staff-auth/contracts";
import type { AdminStaffUserItem } from "../contracts";

const staffUserAdminSelect = `
  SELECT
    staff_users.id AS id,
    staff_users.institution_id AS institutionId,
    institutions.name AS institutionName,
    institutions.slug AS institutionSlug,
    staff_users.email AS email,
    staff_users.username AS username,
    staff_users.role AS role,
    staff_users.status AS status,
    staff_users.created_at AS createdAt,
    staff_users.updated_at AS updatedAt
  FROM staff_users
  LEFT JOIN institutions ON institutions.id = staff_users.institution_id
`;

export const adminStaffUsersRepository = {
  list: async (db: D1Database) => {
    const result = await db
      .prepare(
        `
          ${staffUserAdminSelect}
          ORDER BY
            CASE staff_users.role
              WHEN 'admin' THEN 0
              ELSE 1
            END,
            staff_users.created_at DESC
        `
      )
      .all<AdminStaffUserItem>();

    return result.results;
  },
  findById: async (db: D1Database, staffUserId: string) => {
    return await db
      .prepare(`${staffUserAdminSelect} WHERE staff_users.id = ?1 LIMIT 1`)
      .bind(staffUserId)
      .first<AdminStaffUserItem>();
  },
  deactivate: async (db: D1Database, staffUserId: string) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          UPDATE staff_users
          SET status = 'inactive',
              updated_at = ?2
          WHERE id = ?1
        `
      )
      .bind(staffUserId, now)
      .run();

    return await adminStaffUsersRepository.findById(db, staffUserId);
  },
  listInvitesForUser: async (db: D1Database, input: { institutionId: string | null; email: string }) => {
    if (input.institutionId) {
      const result = await db
        .prepare(
          `
            SELECT id
            FROM staff_invites
            WHERE institution_id = ?1
              AND LOWER(email) = ?2
          `
        )
        .bind(input.institutionId, input.email.trim().toLowerCase())
        .all<{ id: string }>();

      return result.results;
    }

    const result = await db
      .prepare(
        `
          SELECT id
          FROM staff_invites
          WHERE institution_id IS NULL
            AND LOWER(email) = ?1
        `
      )
      .bind(input.email.trim().toLowerCase())
      .all<{ id: string }>();

    return result.results;
  },
  delete: async (db: D1Database, staffUserId: string) => {
    await db.prepare(`DELETE FROM staff_users WHERE id = ?1`).bind(staffUserId).run();
  },
  findRawById: async (db: D1Database, staffUserId: string) => {
    return await db
      .prepare(
        `
          SELECT
            id,
            institution_id AS institutionId,
            email,
            username,
            password_hash AS passwordHash,
            role,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM staff_users
          WHERE id = ?1
          LIMIT 1
        `
      )
      .bind(staffUserId)
      .first<StaffUser>();
  }
};
