export type StaffRole = "reviewer" | "admin";

export type StaffUserStatus = "active" | "inactive";

export type StaffUser = {
  id: string;
  institutionId: string | null;
  email: string;
  username: string;
  passwordHash: string;
  role: StaffRole;
  status: StaffUserStatus;
  createdAt: string;
  updatedAt: string;
};

export type StaffInvite = {
  id: string;
  institutionId: string | null;
  email: string;
  username: string;
  role: StaffRole;
  inviteTokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
  invitedByStaffUserId: string | null;
  createdAt: string;
  updatedAt: string;
};
