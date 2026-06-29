export type WaitlistEntry = {
  id: string;
  institutionId: string;
  name: string;
  email: string;
  createdAt: string;
};

export type CreateWaitlistEntryRecordInput = {
  institutionId: string;
  name: string;
  email: string;
};
