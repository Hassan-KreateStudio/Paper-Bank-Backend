export type CashoutStatus = "ready" | "requested" | "approved" | "paid" | "cancelled";

export type CashoutRequest = {
  id: string;
  institutionId: string;
  studentId: string;
  approvedUploadCountSnapshot: number;
  amountKes: number;
  status: CashoutStatus;
  mpesaPhoneNumber: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudentRewardProgress = {
  approvedUploads: number;
  lifetimeEarnedKes: number;
  currentCycleApprovedUploads: number;
  currentCycleTargetUploads: number;
  currentCycleEarnedKes: number;
  readyCashoutCount: number;
  pendingCashoutCount: number;
  cashoutReady: boolean;
};

export type StudentRewardsSnapshot = {
  studentId: string;
  institutionId: string;
  progress: StudentRewardProgress;
  cashoutRequests: CashoutRequest[];
};

export type DashboardCashoutItem = {
  id: string;
  institutionId: string;
  institutionName: string;
  studentId: string;
  studentAdmissionNumber: string;
  studentFullName: string;
  studentEmail: string;
  approvedUploadCountSnapshot: number;
  amountKes: number;
  status: CashoutStatus;
  mpesaPhoneNumber: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};
