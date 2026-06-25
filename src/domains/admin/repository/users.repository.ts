import type { StudentRole } from "../../students/contracts";
import type { AdminUserItem } from "../contracts";

export const adminUsersRepository = {
  list: async (db: D1Database) => {
    const result = await db
      .prepare(
        `
          SELECT
            students.id,
            students.institution_id AS institutionId,
            institutions.name AS institutionName,
            institutions.slug AS institutionSlug,
            students.admission_number AS admissionNumber,
            students.email,
            students.full_name AS fullName,
            students.role,
            students.status,
            students.email_verified_at AS emailVerifiedAt
          FROM students
          INNER JOIN institutions
            ON institutions.id = students.institution_id
          ORDER BY institutions.name ASC, students.full_name ASC
        `
      )
      .all<AdminUserItem>();

    return result.results;
  },
  findById: async (db: D1Database, studentId: string) => {
    return db
      .prepare(
        `
          SELECT
            students.id,
            students.institution_id AS institutionId,
            institutions.name AS institutionName,
            institutions.slug AS institutionSlug,
            students.admission_number AS admissionNumber,
            students.email,
            students.full_name AS fullName,
            students.role,
            students.status,
            students.email_verified_at AS emailVerifiedAt
          FROM students
          INNER JOIN institutions
            ON institutions.id = students.institution_id
          WHERE students.id = ?1
          LIMIT 1
        `
      )
      .bind(studentId)
      .first<AdminUserItem>();
  },
  updateRole: async (db: D1Database, studentId: string, role: StudentRole) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          UPDATE students
          SET role = ?2,
              updated_at = ?3
          WHERE id = ?1
        `
      )
      .bind(studentId, role, now)
      .run();

    return await adminUsersRepository.findById(db, studentId);
  }
};
