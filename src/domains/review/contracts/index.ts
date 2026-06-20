export type ReviewDecision = {
  id: string;
  uploadSubmissionId: string;
  reviewerStudentId: string | null;
  decision: string;
  notes: string | null;
  createdAt: string;
};
