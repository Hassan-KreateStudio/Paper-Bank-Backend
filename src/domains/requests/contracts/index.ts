export type PaperRequest = {
  id: string;
  institutionId: string;
  studentId: string;
  requestType: "upload" | "retrieve";
  rawQuery: string;
  status: string;
};
