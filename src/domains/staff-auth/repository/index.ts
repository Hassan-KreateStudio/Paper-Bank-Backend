import type { StaffInvite, StaffRole, StaffUser } from "../contracts";

const staffUserSelect = `
  SELECT
    id,
    institution_id AS institutionId,
    email,
    username,
    password_hash AS passwordHash,
    role,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM staff_users
`;

const staffInviteSelect = `
  SELECT
    id,
    institution_id AS institutionId,
    email,
    username,
    role,
    invite_token_hash AS inviteTokenHash,
    expires_at AS expiresAt,
    consumed_at AS consumedAt,
    invited_by_staff_user_id AS invitedByStaffUserId,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM staff_invites
`;

export const staffAuthRepository = {
  findById: async (db: D1Database, staffUserId: string) => {
    return await db
      .prepare(`${staffUserSelect} WHERE id = ?1 LIMIT 1`)
      .bind(staffUserId)
      .first<StaffUser>();
  },
  findByUsername: async (db: D1Database, username: string) => {
    return await db
      .prepare(`${staffUserSelect} WHERE LOWER(username) = ?1 LIMIT 1`)
      .bind(username.trim().toLowerCase())
      .first<StaffUser>();
  },
  findByEmail: async (db: D1Database, email: string) => {
    return await db
      .prepare(`${staffUserSelect} WHERE LOWER(email) = ?1 LIMIT 1`)
      .bind(email.trim().toLowerCase())
      .first<StaffUser>();
  },
  listCashoutNotificationRecipients: async (db: D1Database, institutionId: string) => {
    const result = await db
      .prepare(
        `
          ${staffUserSelect}
          WHERE status = 'active'
            AND ((role = 'reviewer' AND institution_id = ?1) OR role = 'admin')
          ORDER BY created_at ASC
        `
      )
      .bind(institutionId)
      .all<StaffUser>();

    return result.results;
  },
  create: async (
    db: D1Database,
    input: {
      id: string;
      institutionId: string | null;
      email: string;
      username: string;
      passwordHash: string;
      role: StaffRole;
      status: "active" | "inactive";
    }
  ) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          INSERT INTO staff_users (
            id,
            institution_id,
            email,
            username,
            password_hash,
            role,
            status,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        `
      )
      .bind(
        input.id,
        input.institutionId,
        input.email,
        input.username,
        input.passwordHash,
        input.role,
        input.status,
        now,
        now
      )
      .run();

    return await staffAuthRepository.findById(db, input.id);
  },
  activate: async (db: D1Database, staffUserId: string, passwordHash: string) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          UPDATE staff_users
          SET password_hash = ?2,
              status = 'active',
              updated_at = ?3
          WHERE id = ?1
        `
      )
      .bind(staffUserId, passwordHash, now)
      .run();

    return await staffAuthRepository.findById(db, staffUserId);
  },
  createInvite: async (
    db: D1Database,
    input: {
      id: string;
      institutionId: string | null;
      email: string;
      username: string;
      role: StaffRole;
      inviteTokenHash: string;
      expiresAt: string;
      invitedByStaffUserId: string | null;
    }
  ) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          INSERT INTO staff_invites (
            id,
            institution_id,
            email,
            username,
            role,
            invite_token_hash,
            expires_at,
            consumed_at,
            invited_by_staff_user_id,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10)
        `
      )
      .bind(
        input.id,
        input.institutionId,
        input.email,
        input.username,
        input.role,
        input.inviteTokenHash,
        input.expiresAt,
        input.invitedByStaffUserId,
        now,
        now
      )
      .run();

    return await staffAuthRepository.findInviteById(db, input.id);
  },
  findInviteById: async (db: D1Database, inviteId: string) => {
    return await db
      .prepare(`${staffInviteSelect} WHERE id = ?1 LIMIT 1`)
      .bind(inviteId)
      .first<StaffInvite>();
  },
  findPendingInviteByEmail: async (db: D1Database, institutionId: string | null, email: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    if (institutionId) {
      return await db
        .prepare(
          `
            ${staffInviteSelect}
            WHERE institution_id = ?1
              AND LOWER(email) = ?2
              AND consumed_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
          `
        )
        .bind(institutionId, normalizedEmail)
        .first<StaffInvite>();
    }

    return await db
      .prepare(
        `
          ${staffInviteSelect}
          WHERE institution_id IS NULL
            AND LOWER(email) = ?1
            AND consumed_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .bind(normalizedEmail)
      .first<StaffInvite>();
  },
  consumeInvite: async (db: D1Database, inviteId: string) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          UPDATE staff_invites
          SET consumed_at = ?2,
              updated_at = ?2
          WHERE id = ?1
        `
      )
      .bind(inviteId, now)
      .run();

    return await staffAuthRepository.findInviteById(db, inviteId);
  },
  deleteInvite: async (db: D1Database, inviteId: string) => {
    await db.prepare(`DELETE FROM staff_invites WHERE id = ?1`).bind(inviteId).run();
  },
  deleteUser: async (db: D1Database, staffUserId: string) => {
    await db.prepare(`DELETE FROM staff_users WHERE id = ?1`).bind(staffUserId).run();
  }
};
