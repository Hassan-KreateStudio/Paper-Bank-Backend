import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashStaffPassword } from "../../src/domains/staff-auth/password";

const migrationFiles = [
  "migrations/d1/0001_create_institutions.sql",
  "migrations/d1/0002_create_students.sql",
  "migrations/d1/0003_create_auth_challenges.sql",
  "migrations/d1/0005_make_auth_challenge_student_optional.sql",
  "migrations/d1/0006_create_upload_submissions.sql",
  "migrations/d1/0007_create_papers.sql",
  "migrations/d1/0008_create_review_decisions.sql",
  "migrations/d1/0009_add_paper_search_index.sql",
  "migrations/d1/0010_create_waitlist_entries.sql",
  "migrations/d1/0011_add_upload_review_prompt_to_institutions.sql",
  "migrations/d1/0012_seed_strathmore_upload_review_prompt.sql",
  "migrations/d1/0013_add_upload_review_fields.sql",
  "migrations/d1/0014_make_academic_year_optional.sql",
  "migrations/d1/0015_add_student_role.sql",
  "migrations/d1/0016_create_staff_users.sql",
  "migrations/d1/0017_create_staff_invites.sql",
  "migrations/d1/0018_drop_upload_review_prompt_from_institutions.sql"
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
    role: "student" | "reviewer" | "admin";
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
      role: overrides?.role ?? "student",
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
            role,
            status,
            email_verified_at,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        `
      )
      .run(
        student.id,
        student.institutionId,
        student.admissionNumber,
        student.email,
        student.fullName,
        student.role,
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
            role,
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
          role: "student" | "reviewer" | "admin";
          status: string;
          emailVerifiedAt: string | null;
        }
      | null;
  };

  const seedStaffUser = async (overrides?: Partial<{
    id: string;
    institutionId: string | null;
    email: string;
    username: string;
    password: string;
    passwordHash: string;
    role: "reviewer" | "admin";
    status: "active" | "inactive";
  }>) => {
    const now = new Date().toISOString();
    const institutionId =
      overrides && "institutionId" in overrides ? overrides.institutionId ?? null : "inst_strathmore";
    const staffUser = {
      id: overrides?.id ?? crypto.randomUUID(),
      institutionId,
      email: overrides?.email ?? "staff@paperbank.online",
      username: overrides?.username ?? "staff-user",
      passwordHash:
        overrides?.passwordHash ?? (await hashStaffPassword(overrides?.password ?? "super-secret-password")),
      role: overrides?.role ?? "reviewer",
      status: overrides?.status ?? "active"
    };

    sqlite
      .query(
        `
          INSERT INTO staff_users (
            id,
            institution_id,
            email,
            username,
            password_hash,
            role,
            status,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        `
      )
      .run(
        staffUser.id,
        staffUser.institutionId,
        staffUser.email,
        staffUser.username,
        staffUser.passwordHash,
        staffUser.role,
        staffUser.status,
        now,
        now
      );

    return staffUser;
  };

  const getStaffUser = (staffUserId: string) => {
    return sqlite
      .query(
        `
          SELECT
            id,
            institution_id AS institutionId,
            email,
            username,
            password_hash AS passwordHash,
            role,
            status
          FROM staff_users
          WHERE id = ?1
        `
      )
      .get(staffUserId) as
      | {
          id: string;
          institutionId: string | null;
          email: string;
          username: string;
          passwordHash: string;
          role: "reviewer" | "admin";
          status: "active" | "inactive";
        }
      | null;
  };

  const getStaffUserByEmail = (email: string) => {
    return sqlite
      .query(
        `
          SELECT
            id,
            institution_id AS institutionId,
            email,
            username,
            password_hash AS passwordHash,
            role,
            status
          FROM staff_users
          WHERE LOWER(email) = ?1
        `
      )
      .get(email.trim().toLowerCase()) as
      | {
          id: string;
          institutionId: string | null;
          email: string;
          username: string;
          passwordHash: string;
          role: "reviewer" | "admin";
          status: "active" | "inactive";
        }
      | null;
  };

  const getStaffInvite = (inviteId: string) => {
    return sqlite
      .query(
        `
          SELECT
            id,
            institution_id AS institutionId,
            email,
            username,
            role,
            invite_token_hash AS inviteTokenHash,
            expires_at AS expiresAt,
            consumed_at AS consumedAt,
            invited_by_staff_user_id AS invitedByStaffUserId
          FROM staff_invites
          WHERE id = ?1
        `
      )
      .get(inviteId) as
      | {
          id: string;
          institutionId: string | null;
          email: string;
          username: string;
          role: "reviewer" | "admin";
          inviteTokenHash: string;
          expiresAt: string;
          consumedAt: string | null;
          invitedByStaffUserId: string | null;
        }
      | null;
  };

  const seedPaper = (overrides?: Partial<{
    id: string;
    institutionId: string;
    sourceUploadSubmissionId: string | null;
    title: string;
    unitCode: string;
    unitName: string;
    paperType: string;
    academicYear: string | null;
    status: string;
    fileKey: string;
    fileHash: string;
    documentFingerprint: string | null;
    extractedText: string | null;
  }>) => {
    const now = new Date().toISOString();
    const paper = {
      id: overrides?.id ?? crypto.randomUUID(),
      institutionId: overrides?.institutionId ?? "inst_strathmore",
      sourceUploadSubmissionId: overrides?.sourceUploadSubmissionId ?? null,
      title: overrides?.title ?? "Database Systems End Semester Exam",
      unitCode: overrides?.unitCode ?? "BIT 2205",
      unitName: overrides?.unitName ?? "Database Systems",
      paperType: overrides?.paperType ?? "exam",
      academicYear: overrides?.academicYear ?? null,
      status: overrides?.status ?? "available",
      fileKey: overrides?.fileKey ?? "papers/database-systems.pdf",
      fileHash: overrides?.fileHash ?? "existing-file-hash",
      documentFingerprint: overrides?.documentFingerprint ?? null,
      extractedText: overrides?.extractedText ?? null
    };

    sqlite
      .query(
        `
          INSERT INTO papers (
            id,
            institution_id,
            source_upload_submission_id,
            title,
            unit_code,
            unit_name,
            paper_type,
            academic_year,
            status,
            file_key,
            file_hash,
            document_fingerprint,
            extracted_text,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        `
      )
      .run(
        paper.id,
        paper.institutionId,
        paper.sourceUploadSubmissionId,
        paper.title,
        paper.unitCode,
        paper.unitName,
        paper.paperType,
        paper.academicYear,
        paper.status,
        paper.fileKey,
        paper.fileHash,
        paper.documentFingerprint,
        paper.extractedText,
        now,
        now
      );

    return paper;
  };

  const seedUploadSubmission = (overrides?: Partial<{
    id: string;
    institutionId: string;
    studentId: string;
    title: string;
    unitCode: string;
    unitName: string;
    paperType: string;
    academicYear: string | null;
    description: string | null;
    fileKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    fileHash: string;
    modelLabel: string | null;
    modelConfidence: number | null;
    modelMetadataJson: string | null;
    reviewedByModelAt: string | null;
    documentFingerprint: string | null;
    status: string;
  }>) => {
    const now = new Date().toISOString();
    const existingStudent = sqlite
      .query(
        `
          SELECT id
          FROM students
          WHERE institution_id = ?1
          ORDER BY created_at ASC
          LIMIT 1
        `
      )
      .get((overrides?.institutionId ?? "inst_strathmore")) as { id: string } | null;
    const ensuredStudentId =
      overrides?.studentId ??
      existingStudent?.id ??
      seedStudent({
        institutionId: overrides?.institutionId ?? "inst_strathmore",
        status: "active",
        emailVerifiedAt: now
      }).id;
    const submission = {
      id: overrides?.id ?? crypto.randomUUID(),
      institutionId: overrides?.institutionId ?? "inst_strathmore",
      studentId: ensuredStudentId,
      title: overrides?.title ?? "Database Systems End Semester Exam",
      unitCode: overrides?.unitCode ?? "BIT 2205",
      unitName: overrides?.unitName ?? "Database Systems",
      paperType: overrides?.paperType ?? "exam",
      academicYear: overrides?.academicYear ?? null,
      description: overrides?.description ?? null,
      fileKey: overrides?.fileKey ?? "uploads/database-systems.pdf",
      fileName: overrides?.fileName ?? "database-systems.pdf",
      mimeType: overrides?.mimeType ?? "application/pdf",
      fileSizeBytes: overrides?.fileSizeBytes ?? 1024,
      fileHash: overrides?.fileHash ?? "existing-submission-hash",
      modelLabel: overrides?.modelLabel ?? null,
      modelConfidence: overrides?.modelConfidence ?? null,
      modelMetadataJson: overrides?.modelMetadataJson ?? null,
      reviewedByModelAt: overrides?.reviewedByModelAt ?? null,
      documentFingerprint: overrides?.documentFingerprint ?? null,
      status: overrides?.status ?? "submitted"
    };

    sqlite
      .query(
        `
          INSERT INTO upload_submissions (
            id,
            institution_id,
            student_id,
            title,
            unit_code,
            unit_name,
            paper_type,
            academic_year,
            description,
            file_key,
            file_name,
            mime_type,
            file_size_bytes,
            file_hash,
            model_label,
            model_confidence,
            model_metadata_json,
            reviewed_by_model_at,
            document_fingerprint,
            status,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
        `
      )
      .run(
        submission.id,
        submission.institutionId,
        submission.studentId,
        submission.title,
        submission.unitCode,
        submission.unitName,
        submission.paperType,
        submission.academicYear,
        submission.description,
        submission.fileKey,
        submission.fileName,
        submission.mimeType,
        submission.fileSizeBytes,
        submission.fileHash,
        submission.modelLabel,
        submission.modelConfidence,
        submission.modelMetadataJson,
        submission.reviewedByModelAt,
        submission.documentFingerprint,
        submission.status,
        now,
        now
      );

    return submission;
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

  const seedWaitlistEntry = (overrides?: Partial<{
    id: string;
    institutionId: string;
    name: string;
    email: string;
  }>) => {
    const entry = {
      id: overrides?.id ?? crypto.randomUUID(),
      institutionId: overrides?.institutionId ?? "inst_strathmore",
      name: overrides?.name ?? "Interested Student",
      email: overrides?.email ?? "waitlist.student@strathmore.edu",
      createdAt: new Date().toISOString()
    };

    sqlite
      .query(
        `
          INSERT INTO waitlist_entries (
            id,
            institution_id,
            name,
            email,
            created_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5)
        `
      )
      .run(entry.id, entry.institutionId, entry.name, entry.email, entry.createdAt);

    return entry;
  };

  const close = () => {
    sqlite.close();
  };

  return {
    db,
    close,
    seedInstitution,
    seedStudent,
    seedStaffUser,
    seedPaper,
    seedUploadSubmission,
    seedWaitlistEntry,
    getStudent,
    getStaffUser,
    getStaffUserByEmail,
    getStaffInvite,
    expireChallenge
  };
};
