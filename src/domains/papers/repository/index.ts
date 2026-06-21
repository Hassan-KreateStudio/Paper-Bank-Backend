type PaperDuplicateCandidate = {
  id: string;
  title: string;
  unitCode: string;
  paperType: string;
  academicYear: string;
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
  list: async () => []
};
