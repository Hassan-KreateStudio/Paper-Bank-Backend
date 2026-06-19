import type { CreateStudentInput, Student } from "../contracts";

const studentSelect = `
  SELECT
    id,
    institution_id AS institutionId,
    admission_number AS admissionNumber,
    email,
    full_name AS fullName,
    status,
    email_verified_at AS emailVerifiedAt
  FROM students
`;

export const studentsRepository = {
  findById: async (db: D1Database, id: string) => {
    return db.prepare(`${studentSelect} WHERE id = ?1 LIMIT 1`).bind(id).first<Student>();
  },
  findByInstitutionAndEmail: async (db: D1Database, institutionId: string, email: string) => {
    return db
      .prepare(`${studentSelect} WHERE institution_id = ?1 AND email = ?2 LIMIT 1`)
      .bind(institutionId, email)
      .first<Student>();
  },
  findByInstitutionAndAdmissionNumber: async (
    db: D1Database,
    institutionId: string,
    admissionNumber: string
  ) => {
    return db
      .prepare(`${studentSelect} WHERE institution_id = ?1 AND admission_number = ?2 LIMIT 1`)
      .bind(institutionId, admissionNumber)
      .first<Student>();
  },
  create: async (db: D1Database, input: CreateStudentInput) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          INSERT INTO students (
            id,
            institution_id,
            admission_number,
            email,
            full_name,
            status,
            email_verified_at,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8)
        `
      )
      .bind(
        id,
        input.institutionId,
        input.admissionNumber,
        input.email,
        input.fullName,
        input.status ?? "pending_verification",
        now,
        now
      )
      .run();

    return {
      id,
      institutionId: input.institutionId,
      admissionNumber: input.admissionNumber,
      email: input.email,
      fullName: input.fullName,
      status: input.status ?? "pending_verification",
      emailVerifiedAt: null
    } satisfies Student;
  },
  markVerified: async (db: D1Database, studentId: string, emailVerifiedAt: string) => {
    await db
      .prepare(
        `
          UPDATE students
          SET status = 'active',
              email_verified_at = ?2,
              updated_at = ?2
          WHERE id = ?1
        `
      )
      .bind(studentId, emailVerifiedAt)
      .run();
  }
};
