export type Paper = {
  id: string;
  institutionId: string;
  sourceUploadSubmissionId: string | null;
  title: string;
  unitCode: string;
  unitName: string;
  paperType: string;
  academicYear: string;
  status: string;
  fileKey: string;
  fileHash: string;
  documentFingerprint: string | null;
  extractedText: string | null;
  createdAt: string;
  updatedAt: string;
};
