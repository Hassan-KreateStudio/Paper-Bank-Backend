import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationFiles = [
  "migrations/d1/0001_create_institutions.sql",
  "migrations/d1/0002_create_students.sql",
  "migrations/d1/0003_create_auth_challenges.sql",
  "migrations/d1/0005_make_auth_challenge_student_optional.sql"
];

class TestD1Statement {
  private values: any[] = [];

  constructor(private readonly statement: ReturnType<Database["query"]>) {}

  bind(...values: any[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    const result = this.statement.get(...this.values) as T | null | undefined;
    return result ?? null;
  }

  async all<T>() {
    return {
      results: this.statement.all(...this.values) as T[]
    };
  }

  async run() {
    this.statement.run(...this.values);
    return {
      success: true
    };
  }
}

const loadMigration = (relativePath: string) => {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
};

export const createTestD1 = () => {
  const sqlite = new Database(":memory:");

  for (const migrationFile of migrationFiles) {
    sqlite.exec(loadMigration(migrationFile));
  }

  const db = {
    prepare(sql: string) {
      return new TestD1Statement(sqlite.query(sql));
    }
  } as unknown as D1Database;

  const seedInstitution = (overrides?: Partial<{
    id: string;
    name: string;
    slug: string;
    shortCode: string;
    emailDomain: string;
    status: string;
  }>) => {
    const now = new Date().toISOString();
    const institution = {
      id: overrides?.id ?? "inst_strathmore",
      name: overrides?.name ?? "Strathmore University",
      slug: overrides?.slug ?? "strathmore",
      shortCode: overrides?.shortCode ?? "SU",
      emailDomain: overrides?.emailDomain ?? "strathmore.edu",
      status: overrides?.status ?? "active"
    };

    sqlite
      .query(
        `
          INSERT INTO institutions (
            id,
            name,
            slug,
            short_code,
            email_domain,
            status,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        `
      )
      .run(
        institution.id,
        institution.name,
        institution.slug,
        institution.shortCode,
        institution.emailDomain,
        institution.status,
        now,
        now
      );

    return institution;
  };

  const seedStudent = (overrides?: Partial<{
    id: string;
    institutionId: string;
    admissionNumber: string;
    email: string;
    fullName: string;
    status: string;
    emailVerifiedAt: string | null;
  }>) => {
    const now = new Date().toISOString();
    const student = {
      id: overrides?.id ?? crypto.randomUUID(),
      institutionId: overrides?.institutionId ?? "inst_strathmore",
      admissionNumber: overrides?.admissionNumber ?? "SCT221-0001/2022",
      email: overrides?.email ?? "test.student@strathmore.edu",
      fullName: overrides?.fullName ?? "Test Student",
      status: overrides?.status ?? "pending_verification",
      emailVerifiedAt: overrides?.emailVerifiedAt ?? null
    };

    sqlite
      .query(
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
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        `
      )
      .run(
        student.id,
        student.institutionId,
        student.admissionNumber,
        student.email,
        student.fullName,
        student.status,
        student.emailVerifiedAt,
        now,
        now
      );

    return student;
  };

  const getStudent = (studentId: string) => {
    return sqlite
      .query(
        `
          SELECT
            id,
            institution_id AS institutionId,
            admission_number AS admissionNumber,
            email,
            full_name AS fullName,
            status,
            email_verified_at AS emailVerifiedAt
          FROM students
          WHERE id = ?1
        `
      )
      .get(studentId) as
      | {
          id: string;
          institutionId: string;
          admissionNumber: string;
          email: string;
          fullName: string;
          status: string;
          emailVerifiedAt: string | null;
        }
      | null;
  };

  const expireChallenge = (challengeId: string) => {
    sqlite
      .query(
        `
          UPDATE auth_challenges
          SET expires_at = ?2
          WHERE id = ?1
        `
      )
      .run(challengeId, new Date(Date.now() - 60_000).toISOString());
  };

  const close = () => {
    sqlite.close();
  };

  return {
    db,
    close,
    seedInstitution,
    seedStudent,
    getStudent,
    expireChallenge
  };
};
