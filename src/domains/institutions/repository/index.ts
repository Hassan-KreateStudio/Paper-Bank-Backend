import type { Institution } from "../contracts";

const institutionSelect = `
  SELECT
    id,
    name,
    slug,
    short_code AS shortCode,
    email_domain AS emailDomain,
    status
  FROM institutions
`;

export const institutionsRepository = {
  findAll: async (db: D1Database) => {
    const result = await db.prepare(`${institutionSelect} ORDER BY name ASC`).all<Institution>();
    return result.results;
  },
  findById: async (db: D1Database, id: string) => {
    return db
      .prepare(`${institutionSelect} WHERE id = ?1 LIMIT 1`)
      .bind(id)
      .first<Institution>();
  },
  findBySlug: async (db: D1Database, slug: string) => {
    return db
      .prepare(`${institutionSelect} WHERE slug = ?1 LIMIT 1`)
      .bind(slug)
      .first<Institution>();
  },
  findByEmailDomain: async (db: D1Database, emailDomain: string) => {
    return db
      .prepare(`${institutionSelect} WHERE email_domain = ?1 LIMIT 1`)
      .bind(emailDomain)
      .first<Institution>();
  }
};
