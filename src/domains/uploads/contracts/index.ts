export type UploadRecord = {
  id: string;
  institutionId: string;
  studentId: string;
  title: string;
  unitCode: string;
  unitName: string;
  paperType: string;
  academicYear: string;
  description: string | null;
  fileKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  fileHash: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};
