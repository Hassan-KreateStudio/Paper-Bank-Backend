import type { StudentRole } from "../../students/contracts";

export type AdminInstitutionItem = {
  id: string;
  name: string;
  slug: string;
  shortCode: string;
  emailDomain: string;
  status: string;
  uploadReviewPrompt: string | null;
};

export type AdminUserItem = {
  id: string;
  institutionId: string;
  institutionName: string;
  institutionSlug: string;
  admissionNumber: string;
  email: string;
  fullName: string;
  role: StudentRole;
  status: string;
  emailVerifiedAt: string | null;
};

export type AdminStaffUserItem = {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  institutionSlug: string | null;
  email: string;
  username: string;
  role: "reviewer" | "admin";
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export type AdminReviewQueueItem = {
  id: string;
  institutionId: string;
  institutionName: string;
  studentId: string;
  title: string;
  unitCode: string;
  unitName: string;
  paperType: string;
  academicYear: string | null;
  status: string;
  createdAt: string;
};

export type AdminPaperItem = {
  id: string;
  institutionId: string;
  institutionName: string;
  title: string;
  unitCode: string;
  unitName: string;
  paperType: string;
  academicYear: string | null;
  status: string;
  createdAt: string;
};

export type AdminWaitlistItem = {
  id: string;
  institutionId: string;
  institutionName: string;
  name: string;
  email: string;
  createdAt: string;
};

export type AdminAnalyticsOverview = {
  institutions: number;
  students: number;
  reviewers: number;
  admins: number;
  submittedUploads: number;
  approvedPapers: number;
  waitlistEntries: number;
};
