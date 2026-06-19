export type Student = {
  id: string;
  institutionId: string;
  admissionNumber: string;
  email: string;
  fullName: string;
  status: string;
  emailVerifiedAt: string | null;
};

export type CreateStudentInput = {
  institutionId: string;
  admissionNumber: string;
  email: string;
  fullName: string;
  status?: string;
};
