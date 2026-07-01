import type {
  CashoutRequest,
  CashoutStatus,
  DashboardCashoutItem
} from "../contracts";

const cashoutRequestSelect = `
  SELECT
    id,
    institution_id AS institutionId,
    student_id AS studentId,
    approved_upload_count_snapshot AS approvedUploadCountSnapshot,
    amount_kes AS amountKes,
    status,
    mpesa_phone_number AS mpesaPhoneNumber,
    requested_at AS requestedAt,
    approved_at AS approvedAt,
    paid_at AS paidAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM cashout_requests
`;

export const rewardsRepository = {
  countApprovedUploadsByStudent: async (db: D1Database, studentId: string) => {
    const result = await db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM upload_submissions
          WHERE student_id = ?1
            AND status = 'approved'
        `
      )
      .bind(studentId)
      .first<{ count: number }>();

    return Number(result?.count ?? 0);
  },
  countActiveCashoutRequestsByStudent: async (db: D1Database, studentId: string) => {
    const result = await db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM cashout_requests
          WHERE student_id = ?1
            AND status != 'cancelled'
        `
      )
      .bind(studentId)
      .first<{ count: number }>();

    return Number(result?.count ?? 0);
  },
  listByStudent: async (db: D1Database, studentId: string) => {
    const result = await db
      .prepare(
        `
          ${cashoutRequestSelect}
          WHERE student_id = ?1
          ORDER BY created_at ASC
        `
      )
      .bind(studentId)
      .all<CashoutRequest>();

    return result.results;
  },
  create: async (
    db: D1Database,
    input: {
      id: string;
      institutionId: string;
      studentId: string;
      approvedUploadCountSnapshot: number;
      amountKes: number;
      status: CashoutStatus;
    }
  ) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          INSERT INTO cashout_requests (
            id,
            institution_id,
            student_id,
            approved_upload_count_snapshot,
            amount_kes,
            status,
            mpesa_phone_number,
            requested_at,
            approved_at,
            paid_at,
            created_at,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, NULL, NULL, ?7, ?8)
        `
      )
      .bind(
        input.id,
        input.institutionId,
        input.studentId,
        input.approvedUploadCountSnapshot,
        input.amountKes,
        input.status,
        now,
        now
      )
      .run();

    return await rewardsRepository.findById(db, input.id);
  },
  findById: async (db: D1Database, id: string) => {
    return await db
      .prepare(`${cashoutRequestSelect} WHERE id = ?1 LIMIT 1`)
      .bind(id)
      .first<CashoutRequest>();
  },
  findOldestReadyByStudent: async (db: D1Database, studentId: string) => {
    return await db
      .prepare(
        `
          ${cashoutRequestSelect}
          WHERE student_id = ?1
            AND status = 'ready'
          ORDER BY created_at ASC
          LIMIT 1
        `
      )
      .bind(studentId)
      .first<CashoutRequest>();
  },
  markRequested: async (
    db: D1Database,
    input: {
      id: string;
      mpesaPhoneNumber: string;
    }
  ) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          UPDATE cashout_requests
          SET status = 'requested',
              mpesa_phone_number = ?2,
              requested_at = ?3,
              updated_at = ?3
          WHERE id = ?1
        `
      )
      .bind(input.id, input.mpesaPhoneNumber, now)
      .run();

    return await rewardsRepository.findById(db, input.id);
  },
  markApproved: async (db: D1Database, id: string) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          UPDATE cashout_requests
          SET status = 'approved',
              approved_at = ?2,
              updated_at = ?2
          WHERE id = ?1
        `
      )
      .bind(id, now)
      .run();

    return await rewardsRepository.findById(db, id);
  },
  markPaid: async (db: D1Database, id: string) => {
    const now = new Date().toISOString();

    await db
      .prepare(
        `
          UPDATE cashout_requests
          SET status = 'paid',
              paid_at = ?2,
              updated_at = ?2
          WHERE id = ?1
        `
      )
      .bind(id, now)
      .run();

    return await rewardsRepository.findById(db, id);
  },
  listForInstitution: async (db: D1Database, institutionId: string) => {
    const result = await db
      .prepare(
        `
          SELECT
            cashout_requests.id AS id,
            cashout_requests.institution_id AS institutionId,
            institutions.name AS institutionName,
            cashout_requests.student_id AS studentId,
            students.admission_number AS studentAdmissionNumber,
            students.full_name AS studentFullName,
            students.email AS studentEmail,
            cashout_requests.approved_upload_count_snapshot AS approvedUploadCountSnapshot,
            cashout_requests.amount_kes AS amountKes,
            cashout_requests.status AS status,
            cashout_requests.mpesa_phone_number AS mpesaPhoneNumber,
            cashout_requests.requested_at AS requestedAt,
            cashout_requests.approved_at AS approvedAt,
            cashout_requests.paid_at AS paidAt,
            cashout_requests.created_at AS createdAt,
            cashout_requests.updated_at AS updatedAt
          FROM cashout_requests
          INNER JOIN students ON students.id = cashout_requests.student_id
          INNER JOIN institutions ON institutions.id = cashout_requests.institution_id
          WHERE cashout_requests.institution_id = ?1
          ORDER BY cashout_requests.created_at DESC
        `
      )
      .bind(institutionId)
      .all<DashboardCashoutItem>();

    return result.results;
  },
  listAll: async (db: D1Database) => {
    const result = await db
      .prepare(
        `
          SELECT
            cashout_requests.id AS id,
            cashout_requests.institution_id AS institutionId,
            institutions.name AS institutionName,
            cashout_requests.student_id AS studentId,
            students.admission_number AS studentAdmissionNumber,
            students.full_name AS studentFullName,
            students.email AS studentEmail,
            cashout_requests.approved_upload_count_snapshot AS approvedUploadCountSnapshot,
            cashout_requests.amount_kes AS amountKes,
            cashout_requests.status AS status,
            cashout_requests.mpesa_phone_number AS mpesaPhoneNumber,
            cashout_requests.requested_at AS requestedAt,
            cashout_requests.approved_at AS approvedAt,
            cashout_requests.paid_at AS paidAt,
            cashout_requests.created_at AS createdAt,
            cashout_requests.updated_at AS updatedAt
          FROM cashout_requests
          INNER JOIN students ON students.id = cashout_requests.student_id
          INNER JOIN institutions ON institutions.id = cashout_requests.institution_id
          ORDER BY cashout_requests.created_at DESC
        `
      )
      .all<DashboardCashoutItem>();

    return result.results;
  }
};
