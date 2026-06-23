import type { CreateWaitlistEntryRecordInput, WaitlistEntry } from "../contracts";

const waitlistEntrySelect = `
  SELECT
    id,
    institution_id AS institutionId,
    name,
    email,
    created_at AS createdAt
  FROM waitlist_entries
`;

export const waitlistRepository = {
  create: async (db: D1Database, input: CreateWaitlistEntryRecordInput) => {
    const entry: WaitlistEntry = {
      id: crypto.randomUUID(),
      institutionId: input.institutionId,
      name: input.name,
      email: input.email,
      createdAt: new Date().toISOString()
    };

    await db
      .prepare(
        `
          INSERT INTO waitlist_entries (
            id,
            institution_id,
            name,
            email,
            created_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5)
        `
      )
      .bind(entry.id, entry.institutionId, entry.name, entry.email, entry.createdAt)
      .run();

    return entry;
  },
  findByInstitutionAndEmail: async (db: D1Database, institutionId: string, email: string) => {
    return db
      .prepare(`${waitlistEntrySelect} WHERE institution_id = ?1 AND email = ?2 LIMIT 1`)
      .bind(institutionId, email)
      .first<WaitlistEntry>();
  }
};
