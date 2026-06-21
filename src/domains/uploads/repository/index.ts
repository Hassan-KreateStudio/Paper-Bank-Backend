import type { UploadRecord } from "../contracts";

type UploadDuplicateCandidate = {
  id: string;
  title: string;
  unitCode: string;
  paperType: string;
  academicYear: string;
  status: string;
};

const uploadSubmissionSelect = `
  SELECT
    id,
    title,
    unit_code AS unitCode,
    paper_type AS paperType,
    academic_year AS academicYear,
    status
  FROM upload_submissions
`;

export const uploadsRepository = {
  findById: async (db: D1Database, id: string) => {
    return db
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
            description,
            file_key AS fileKey,
            file_name AS fileName,
            mime_type AS mimeType,
            file_size_bytes AS fileSizeBytes,
            file_hash AS fileHash,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM upload_submissions
          WHERE id = ?1
          LIMIT 1
        `
      )
      .bind(id)
      .first<UploadRecord>();
  },
  findByFileHash: async (db: D1Database, institutionId: string, fileHash: string) => {
    return db
      .prepare(
        `
          ${uploadSubmissionSelect}
          WHERE institution_id = ?1
            AND file_hash = ?2
          LIMIT 1
        `
      )
      .bind(institutionId, fileHash)
      .first<UploadDuplicateCandidate>();
  },
  findByMetadata: async (
    db: D1Database,
    institutionId: string,
    unitCode: string,
    paperType: string,
    academicYear: string
  ) => {
    return db
      .prepare(
        `
          ${uploadSubmissionSelect}
          WHERE institution_id = ?1
            AND unit_code = ?2
            AND paper_type = ?3
            AND academic_year = ?4
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .bind(institutionId, unitCode, paperType, academicYear)
      .first<UploadDuplicateCandidate>();
  },
  create: async (
    db: D1Database,
    input: Omit<UploadRecord, "createdAt" | "updatedAt">
  ) => {
    const now = new Date().toISOString();

    await db
      .prepare(
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
            status,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
        `
      )
      .bind(
        input.id,
        input.institutionId,
        input.studentId,
        input.title,
        input.unitCode,
        input.unitName,
        input.paperType,
        input.academicYear,
        input.description,
        input.fileKey,
        input.fileName,
        input.mimeType,
        input.fileSizeBytes,
        input.fileHash,
        input.status,
        now,
        now
      )
      .run();

    return await uploadsRepository.findById(db, input.id);
  },
  updateStatus: async (db: D1Database, id: string, status: string) => {
    await db
      .prepare(
        `
          UPDATE upload_submissions
          SET status = ?2,
              updated_at = ?3
          WHERE id = ?1
        `
      )
      .bind(id, status, new Date().toISOString())
      .run();

    return await uploadsRepository.findById(db, id);
  }
};
