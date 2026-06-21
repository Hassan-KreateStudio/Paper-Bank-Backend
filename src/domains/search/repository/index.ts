type SearchChunkRow = {
  paperId: string;
  title: string;
  unitCode: string;
  unitName: string;
  paperType: string;
  academicYear: string;
  content: string;
  embeddingJson: string;
  chunkIndex: number;
  createdAt: string;
};

export const searchRepository = {
  replacePaperChunks: async (
    db: D1Database,
    input: {
      paperId: string;
      institutionId: string;
      chunks: Array<{
        id: string;
        chunkIndex: number;
        content: string;
        embeddingJson: string;
      }>;
    }
  ) => {
    await db
      .prepare(
        `
          DELETE FROM paper_search_chunks
          WHERE paper_id = ?1
        `
      )
      .bind(input.paperId)
      .run();

    const createdAt = new Date().toISOString();

    for (const chunk of input.chunks) {
      await db
        .prepare(
          `
            INSERT INTO paper_search_chunks (
              id,
              paper_id,
              institution_id,
              chunk_index,
              content,
              embedding_json,
              created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          `
        )
        .bind(
          chunk.id,
          input.paperId,
          input.institutionId,
          chunk.chunkIndex,
          chunk.content,
          chunk.embeddingJson,
          createdAt
        )
        .run();
    }
  },
  findCandidateChunks: async (
    db: D1Database,
    institutionId: string,
    options?: {
      paperType?: string | null;
      academicYear?: string | null;
      unitCode?: string | null;
      limit?: number;
    }
  ) => {
    const result = await db
      .prepare(
        `
          SELECT
            chunks.paper_id AS paperId,
            papers.title,
            papers.unit_code AS unitCode,
            papers.unit_name AS unitName,
            papers.paper_type AS paperType,
            papers.academic_year AS academicYear,
            chunks.content,
            chunks.embedding_json AS embeddingJson,
            chunks.chunk_index AS chunkIndex,
            chunks.created_at AS createdAt
          FROM paper_search_chunks AS chunks
          INNER JOIN papers ON papers.id = chunks.paper_id
          WHERE chunks.institution_id = ?1
            AND papers.status = 'available'
            AND (?2 IS NULL OR papers.paper_type = ?2)
            AND (?3 IS NULL OR papers.academic_year = ?3)
            AND (?4 IS NULL OR papers.unit_code = ?4)
          ORDER BY chunks.created_at DESC
          LIMIT ?5
        `
      )
      .bind(
        institutionId,
        options?.paperType ?? null,
        options?.academicYear ?? null,
        options?.unitCode ?? null,
        options?.limit ?? 120
      )
      .all<SearchChunkRow>();

    return result.results;
  }
};
