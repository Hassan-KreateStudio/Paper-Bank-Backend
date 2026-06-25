import type { Paper } from "../contracts";

type PaperDuplicateCandidate = {
  id: string;
  title: string;
  unitCode: string;
  paperType: string;
  academicYear: string | null;
  status: string;
};

const paperSelect = `
  SELECT
    id,
    title,
    unit_code AS unitCode,
    paper_type AS paperType,
    academic_year AS academicYear,
    status
  FROM papers
`;

export const papersRepository = {
  findById: async (db: D1Database, id: string) => {
    return db
      .prepare(
        `
          SELECT
            id,
            institution_id AS institutionId,
            source_upload_submission_id AS sourceUploadSubmissionId,
            title,
            unit_code AS unitCode,
            unit_name AS unitName,
            paper_type AS paperType,
            academic_year AS academicYear,
            status,
            file_key AS fileKey,
            file_hash AS fileHash,
            document_fingerprint AS documentFingerprint,
            extracted_text AS extractedText,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM papers
          WHERE id = ?1
          LIMIT 1
        `
      )
      .bind(id)
      .first<Paper>();
  },
  findBySourceUploadSubmissionId: async (db: D1Database, sourceUploadSubmissionId: string) => {
    return db
      .prepare(
        `
          SELECT
            id,
            institution_id AS institutionId,
            source_upload_submission_id AS sourceUploadSubmissionId,
            title,
            unit_code AS unitCode,
            unit_name AS unitName,
            paper_type AS paperType,
            academic_year AS academicYear,
            status,
            file_key AS fileKey,
            file_hash AS fileHash,
            document_fingerprint AS documentFingerprint,
            extracted_text AS extractedText,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM papers
          WHERE source_upload_submission_id = ?1
          LIMIT 1
        `
      )
      .bind(sourceUploadSubmissionId)
      .first<Paper>();
  },
  findByFileHash: async (db: D1Database, institutionId: string, fileHash: string) => {
    return db
      .prepare(
        `
          ${paperSelect}
          WHERE institution_id = ?1
            AND file_hash = ?2
          LIMIT 1
        `
      )
      .bind(institutionId, fileHash)
      .first<PaperDuplicateCandidate>();
  },
  findByDocumentFingerprint: async (
    db: D1Database,
    institutionId: string,
    documentFingerprint: string
  ) => {
    return db
      .prepare(
        `
          ${paperSelect}
          WHERE institution_id = ?1
            AND document_fingerprint = ?2
          LIMIT 1
        `
      )
      .bind(institutionId, documentFingerprint)
      .first<PaperDuplicateCandidate>();
  },
  findByMetadata: async (
    db: D1Database,
    institutionId: string,
    unitCode: string,
    paperType: string,
    academicYear: string | null
  ) => {
    return db
      .prepare(
        `
          ${paperSelect}
          WHERE institution_id = ?1
            AND unit_code = ?2
            AND paper_type = ?3
            AND academic_year = ?4
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .bind(institutionId, unitCode, paperType, academicYear)
      .first<PaperDuplicateCandidate>();
  },
  create: async (
    db: D1Database,
    input: Omit<Paper, "createdAt" | "updatedAt">
  ) => {
    const now = new Date().toISOString();

    await db
      .prepare(
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
      .bind(
        input.id,
        input.institutionId,
        input.sourceUploadSubmissionId,
        input.title,
        input.unitCode,
        input.unitName,
        input.paperType,
        input.academicYear,
        input.status,
        input.fileKey,
        input.fileHash,
        input.documentFingerprint,
        input.extractedText,
        now,
        now
      )
      .run();

    return await papersRepository.findById(db, input.id);
  },
  list: async (db: D1Database, institutionId: string, query?: string) => {
    const normalizedQuery = query?.trim();
    const searchPattern = normalizedQuery ? `%${normalizedQuery.toLowerCase()}%` : null;

    const statement = searchPattern
      ? db.prepare(
          `
            SELECT
              id,
              institution_id AS institutionId,
              source_upload_submission_id AS sourceUploadSubmissionId,
              title,
              unit_code AS unitCode,
              unit_name AS unitName,
              paper_type AS paperType,
              academic_year AS academicYear,
              status,
              file_key AS fileKey,
              file_hash AS fileHash,
              document_fingerprint AS documentFingerprint,
              extracted_text AS extractedText,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM papers
            WHERE institution_id = ?1
              AND status = 'available'
              AND (
                LOWER(title) LIKE ?2
                OR LOWER(unit_code) LIKE ?2
                OR LOWER(unit_name) LIKE ?2
                OR LOWER(paper_type) LIKE ?2
                OR LOWER(academic_year) LIKE ?2
              )
            ORDER BY created_at DESC
          `
        ).bind(institutionId, searchPattern)
      : db.prepare(
          `
            SELECT
              id,
              institution_id AS institutionId,
              source_upload_submission_id AS sourceUploadSubmissionId,
              title,
              unit_code AS unitCode,
              unit_name AS unitName,
              paper_type AS paperType,
              academic_year AS academicYear,
              status,
              file_key AS fileKey,
              file_hash AS fileHash,
              document_fingerprint AS documentFingerprint,
              extracted_text AS extractedText,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM papers
            WHERE institution_id = ?1
              AND status = 'available'
            ORDER BY created_at DESC
          `
        ).bind(institutionId);

    const result = await statement.all<Paper>();
    return result.results;
  }
};
