import type { AuthChallenge } from "../contracts";

const authChallengeSelect = `
  SELECT
    id,
    institution_id AS institutionId,
    student_id AS studentId,
    admission_number AS admissionNumber,
    email,
    full_name AS fullName,
    verification_code_hash AS verificationCodeHash,
    status,
    expires_at AS expiresAt,
    consumed_at AS consumedAt,
    created_at AS createdAt
  FROM auth_challenges
`;

export const authRepository = {
  createChallenge: async (db: D1Database, challenge: AuthChallenge) => {
    await db
      .prepare(
        `
          INSERT INTO auth_challenges (
            id,
            institution_id,
            student_id,
            admission_number,
            email,
            full_name,
            verification_code_hash,
            status,
            expires_at,
            consumed_at,
            created_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        `
      )
      .bind(
        challenge.id,
        challenge.institutionId,
        challenge.studentId,
        challenge.admissionNumber,
        challenge.email,
        challenge.fullName,
        challenge.verificationCodeHash,
        challenge.status,
        challenge.expiresAt,
        challenge.consumedAt,
        challenge.createdAt
      )
      .run();

    return challenge;
  },
  findChallengeById: async (db: D1Database, challengeId: string) => {
    return db
      .prepare(`${authChallengeSelect} WHERE id = ?1 LIMIT 1`)
      .bind(challengeId)
      .first<AuthChallenge>();
  },
  findLatestPendingChallenge: async (
    db: D1Database,
    institutionId: string,
    admissionNumber: string,
    email: string
  ) => {
    return db
      .prepare(
        `
          ${authChallengeSelect}
          WHERE institution_id = ?1
            AND admission_number = ?2
            AND email = ?3
            AND status = 'pending'
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .bind(institutionId, admissionNumber, email)
      .first<AuthChallenge>();
  },
  consumeChallenge: async (db: D1Database, challengeId: string, consumedAt: string) => {
    await db
      .prepare(
        `
          UPDATE auth_challenges
          SET status = 'consumed', consumed_at = ?2
          WHERE id = ?1
        `
      )
      .bind(challengeId, consumedAt)
      .run();
  },
  attachStudent: async (db: D1Database, challengeId: string, studentId: string) => {
    await db
      .prepare(
        `
          UPDATE auth_challenges
          SET student_id = ?2
          WHERE id = ?1
        `
      )
      .bind(challengeId, studentId)
      .run();
  }
};
