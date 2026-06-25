export type ReviewDecision = {
  id: string;
  uploadSubmissionId: string;
  reviewerStudentId: string | null;
  decision: string;
  notes: string | null;
  createdAt: string;
};

export type ReviewQueueItem = {
  id: string;
  institutionId: string;
  studentId: string;
  title: string;
  unitCode: string;
  unitName: string;
  paperType: string;
  academicYear: string | null;
  status: string;
  createdAt: string;
};
