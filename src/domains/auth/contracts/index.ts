export type StudentSession = {
  studentId: string;
  institutionId: string;
};

export type AuthChallenge = {
  id: string;
  institutionId: string;
  studentId: string | null;
  admissionNumber: string;
  email: string;
  fullName: string;
  verificationCodeHash: string;
  status: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

export type CreateChallengeInput = {
  admissionNumber: string;
  email: string;
  fullName: string;
};

export type VerifyChallengeInput = {
  challengeId: string;
  verificationCode: string;
};
