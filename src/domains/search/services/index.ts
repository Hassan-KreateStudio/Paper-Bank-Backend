import type { EnvBindings } from "../../../lib/app-env";
import { AppError } from "../../../lib/errors";
import { createEmbedding } from "../../../platform/ai";
import { searchRepository } from "../repository";
import type { SearchResult } from "../contracts";

const SEARCH_CHUNK_SIZE = 420;
const SEARCH_CHUNK_OVERLAP = 80;

const parseSearchFilters = (query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  const academicYear = normalizedQuery.match(/\b20\d{2}\s*\/\s*20\d{2}\b/)?.[0]?.replace(/\s+/g, "") ?? null;
  const unitCode = normalizedQuery.match(/\b[a-z]{2,4}\s?\d{4}\b/i)?.[0]?.toUpperCase() ?? null;
  const paperType = normalizedQuery.includes("cat")
    ? "cat"
    : normalizedQuery.includes("exam")
      ? "exam"
      : normalizedQuery.includes("research")
        ? "research"
        : null;
  const wantsLatest = /\blatest|newest|recent\b/i.test(normalizedQuery);

  return {
    academicYear,
    unitCode,
    paperType,
    wantsLatest
  };
};

type SearchFilters = ReturnType<typeof parseSearchFilters>;

const normalizeVector = (vector: number[]) => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
};

const cosineSimilarity = (left: number[], right: number[]) => {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dotProduct = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
  }

  return dotProduct;
};

const countOccurrences = (text: string, token: string) => {
  if (!token) {
    return 0;
  }

  return text.split(token).length - 1;
};

const getAcademicYearSortValue = (academicYear: string | null) => {
  if (!academicYear) {
    return -1;
  }

  const rangeMatch = academicYear.match(/\b(20\d{2})\s*\/\s*(20\d{2})\b/);

  if (rangeMatch) {
    return Number(rangeMatch[2]);
  }

  const yearMatch = academicYear.match(/\b(20\d{2})\b/);

  if (yearMatch) {
    return Number(yearMatch[1]);
  }

  return -1;
};

const scoreMetadataMatch = (
  query: string,
  filters: SearchFilters,
  candidate: {
    title: string;
    unitCode: string;
    unitName: string;
    paperType: string;
    academicYear: string | null;
  }
) => {
  const normalizedQuery = query.toLowerCase();
  const haystack = [
    candidate.title,
    candidate.unitCode,
    candidate.unitName,
    candidate.paperType,
    candidate.academicYear ?? ""
  ]
    .join(" ")
    .toLowerCase();
  const tokens = normalizedQuery.match(/[a-z0-9/]+/g) ?? [];
  let score = 0;

  for (const token of tokens) {
    score += countOccurrences(haystack, token) * 0.18;
  }

  if (haystack.includes(normalizedQuery)) {
    score += 1.5;
  }

  if (candidate.unitCode.toLowerCase() === normalizedQuery) {
    score += 2;
  }

  if (filters.unitCode && candidate.unitCode.toUpperCase() === filters.unitCode) {
    score += 3.5;
  }

  if (filters.paperType && candidate.paperType === filters.paperType) {
    score += 1.25;
  }

  if (filters.academicYear && candidate.academicYear === filters.academicYear) {
    score += 1;
  }

  return score;
};

const compareRankedResults = (
  left: SearchResult,
  right: SearchResult,
  filters: SearchFilters
) => {
  if (filters.wantsLatest) {
    const yearDelta = getAcademicYearSortValue(right.academicYear) - getAcademicYearSortValue(left.academicYear);

    if (yearDelta !== 0) {
      return yearDelta;
    }
  }

  if (right.score !== left.score) {
    return right.score - left.score;
  }

  return getAcademicYearSortValue(right.academicYear) - getAcademicYearSortValue(left.academicYear);
};

const createSnippet = (content: string, query: string) => {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const normalizedQuery = query.trim().toLowerCase();
  const matchIndex = normalizedContent.toLowerCase().indexOf(normalizedQuery);

  if (matchIndex === -1) {
    const queryTokens = normalizedQuery.match(/[a-z0-9/]+/g) ?? [];
    const keyword = queryTokens
      .filter((token) => token.length >= 4)
      .sort((left, right) => right.length - left.length)
      .find((token) => normalizedContent.toLowerCase().includes(token));

    if (!keyword) {
      return normalizedContent.slice(0, 220);
    }

    const keywordIndex = normalizedContent.toLowerCase().indexOf(keyword);
    const keywordStart = Math.max(0, keywordIndex - 80);
    const keywordEnd = Math.min(normalizedContent.length, keywordIndex + keyword.length + 140);

    return normalizedContent.slice(keywordStart, keywordEnd);
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(normalizedContent.length, matchIndex + normalizedQuery.length + 140);
  return normalizedContent.slice(start, end);
};

export const createSearchChunks = (text: string) => {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalizedText.length) {
    const end = Math.min(normalizedText.length, start + SEARCH_CHUNK_SIZE);
    const chunk = normalizedText.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalizedText.length) {
      break;
    }

    start = Math.max(end - SEARCH_CHUNK_OVERLAP, start + 1);
  }

  return chunks;
};

export const searchService = {
  indexApprovedPaper: async (
    db: D1Database,
    env: EnvBindings,
    input: {
      paperId: string;
      institutionId: string;
      extractedText: string;
    }
  ) => {
    const chunks = createSearchChunks(input.extractedText);

    if (chunks.length === 0) {
      await searchRepository.replacePaperChunks(db, {
        paperId: input.paperId,
        institutionId: input.institutionId,
        chunks: []
      });
      return;
    }

    const indexedChunks = await Promise.all(
      chunks.map(async (content, chunkIndex) => {
        const embedding = await createEmbedding(env, content);

        return {
          id: crypto.randomUUID(),
          chunkIndex,
          content,
          embeddingJson: JSON.stringify(normalizeVector(embedding.vector))
        };
      })
    );

    await searchRepository.replacePaperChunks(db, {
      paperId: input.paperId,
      institutionId: input.institutionId,
      chunks: indexedChunks
    });
  },
  runHybridSearch: async (
    db: D1Database,
    env: EnvBindings,
    institutionId: string,
    query: string
  ) => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      throw new AppError("Search query is required.", 400);
    }

    const filters = parseSearchFilters(normalizedQuery);
    const queryEmbedding = await createEmbedding(env, normalizedQuery);
    const candidates = await searchRepository.findCandidateChunks(db, institutionId, {
      paperType: filters.paperType,
      academicYear: filters.academicYear,
      unitCode: filters.unitCode
    });
    const rankedPapers = new Map<string, SearchResult>();

    for (const candidate of candidates) {
      const metadataScore = scoreMetadataMatch(normalizedQuery, filters, candidate);
      const semanticScore = cosineSimilarity(queryEmbedding.vector, JSON.parse(candidate.embeddingJson) as number[]);
      const combinedScore = metadataScore * 0.55 + semanticScore * 1.75;
      const existingResult = rankedPapers.get(candidate.paperId);
      const nextResult: SearchResult = {
        paperId: candidate.paperId,
        score: combinedScore,
        title: candidate.title,
        unitCode: candidate.unitCode,
        unitName: candidate.unitName,
        paperType: candidate.paperType,
        academicYear: candidate.academicYear,
        snippet: createSnippet(candidate.content, normalizedQuery),
        matchReason:
          metadataScore > 0.9 && semanticScore > 0.2
            ? "hybrid"
            : metadataScore >= semanticScore
              ? "metadata"
              : "content"
      };

      if (!existingResult || nextResult.score > existingResult.score) {
        rankedPapers.set(candidate.paperId, nextResult);
      }
    }

    const results = Array.from(rankedPapers.values())
      .sort((left, right) => compareRankedResults(left, right, filters))
      .slice(0, 12);

    return {
      query: normalizedQuery,
      filters,
      results
    };
  }
};
