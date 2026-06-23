export type WaitlistEntry = {
  id: string;
  institutionId: string;
  name: string;
  email: string;
  createdAt: string;
};

export type CreateWaitlistEntryInput = {
  institutionSlug: string;
  name: string;
  email: string;
};

export type CreateWaitlistEntryRecordInput = {
  institutionId: string;
  name: string;
  email: string;
};
