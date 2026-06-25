export type StudentRole = "student" | "reviewer" | "admin";

export type Student = {
  id: string;
  institutionId: string;
  admissionNumber: string;
  email: string;
  fullName: string;
  role: StudentRole;
  status: string;
  emailVerifiedAt: string | null;
};

export type CreateStudentInput = {
  institutionId: string;
  admissionNumber: string;
  email: string;
  fullName: string;
  role?: StudentRole;
  status?: string;
};
