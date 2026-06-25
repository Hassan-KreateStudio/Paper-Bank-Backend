export type SearchResult = {
  paperId: string;
  score: number;
  title: string;
  unitCode: string;
  unitName: string;
  paperType: string;
  academicYear: string | null;
  snippet: string;
  matchReason: "metadata" | "content" | "hybrid";
};
