import { afterEach, describe, expect, it } from "bun:test";
import app from "../../src";
import { createAuthToken } from "../../src/domains/auth/token";
import { createStaffAuthToken } from "../../src/domains/staff-auth/token";
import { pdfRenderer } from "../../src/platform/pdf/render-pdf-pages";
import { createPdfFixture } from "../support/pdf-fixture";
import { createMockR2Bucket } from "../support/mock-r2";
import { withCapturedResendEmails } from "../support/resend-mock";
import { createTestD1 } from "../support/test-d1";

const authSecret = "super-secret-auth-token";
const staffAuthSecret = "super-secret-staff-auth-token";

const createStudentAccessToken = async (
  studentId: string,
  institutionId = "inst_strathmore",
  role: "student" | "reviewer" | "admin" = "student"
) => {
  const token = await createAuthToken(studentId, institutionId, role, authSecret);
  return token.token;
};

const createStaffAccessToken = async (
  staffUserId: string,
  institutionId: string | null,
  role: "reviewer" | "admin"
) => {
  const token = await createStaffAuthToken(staffUserId, institutionId, role, staffAuthSecret);
  return token.token;
};

const createEnv = (db: D1Database, bucket: R2Bucket) => ({
  APP_ENV: "test",
  UPLOAD_REVIEW_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  EMBEDDING_MODEL: "@cf/baai/bge-base-en-v1.5",
  RETRIEVAL_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  AUTH_TOKEN_SECRET: authSecret,
  STAFF_AUTH_TOKEN_SECRET: staffAuthSecret,
  RESEND_API_KEY: "re_test_key",
  AUTH_EMAIL_FROM: "PaperBank <staff@paperbank.online>",
  DB: db,
  PAPERS_BUCKET: bucket,
  AI: {
    run: async (_model: string, payload: unknown) => {
      if (typeof payload === "object" && payload !== null && "messages" in payload) {
        return "Strathmore University\nBBT 4106\nBusiness Intelligence I\nContinuous Assessment Test (CAT) 1";
      }

      return {
        data: [Array.from({ length: 64 }, (_unused, index) => index + 1)]
      };
    }
  },
  BROWSER: {
    fetch: fetch
  }
});

const createStoredPdfFile = async (name: string) =>
  await createPdfFixture({
    name,
    pageColor: "white",
    textBlocks: [
      { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
      { text: "Unit Code: BBT 4106", x: 297, y: 690, align: "center", fontSize: 14 },
      { text: "Unit Name: Business Intelligence I", x: 297, y: 660, align: "center", fontSize: 14 },
      { text: "Continuous Assessment Test (CAT) 1", x: 297, y: 630, align: "center", fontSize: 14 }
    ]
  });

describe("student rewards and cashout flow", () => {
  const originalRenderPdfPages = pdfRenderer.renderPdfPages;

  afterEach(() => {
    pdfRenderer.renderPdfPages = originalRenderPdfPages;
  });

  it("creates a ready cashout when the fifth upload is approved and notifies student and staff", async () => {
    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];

    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);
    testDb.seedInstitution();

    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString(),
      email: "rewards.student@strathmore.edu",
      fullName: "Rewards Student"
    });
    const reviewer = await testDb.seedStaffUser({
      institutionId: "inst_strathmore",
      email: "reviewer@paperbank.online",
      username: "reviewer-one",
      role: "reviewer",
      status: "active"
    });
    const admin = await testDb.seedStaffUser({
      institutionId: null,
      email: "admin@paperbank.online",
      username: "admin-one",
      role: "admin",
      status: "active"
    });

    for (let index = 0; index < 4; index += 1) {
      testDb.seedUploadSubmission({
        id: `approved-submission-${index}`,
        studentId: student.id,
        title: `Approved CAT ${index + 1}`,
        unitCode: "BBT 4106",
        unitName: "Business Intelligence I",
        paperType: "cat",
        status: "approved",
        fileHash: `approved-hash-${index}`
      });
    }

    const submission = testDb.seedUploadSubmission({
      id: "submitted-fifth-paper",
      studentId: student.id,
      title: "Business Intelligence CAT 1",
      unitCode: "BBT 4106",
      unitName: "Business Intelligence I",
      paperType: "cat",
      fileKey: "uploads/rewards-fifth.pdf",
      fileName: "rewards-fifth.pdf",
      fileHash: "fifth-file-hash"
    });

    const storedPdf = await createStoredPdfFile("rewards-fifth.pdf");
    await (bucket as unknown as ReturnType<typeof createMockR2Bucket>).put(
      submission.fileKey,
      await storedPdf.arrayBuffer(),
      {
        httpMetadata: {
          contentType: "application/pdf"
        }
      }
    );

    const reviewerAccessToken = await createStaffAccessToken(reviewer.id, "inst_strathmore", "reviewer");
    const studentAccessToken = await createStudentAccessToken(student.id);

    const { emails } = await withCapturedResendEmails(async () => {
      const approveResponse = await app.request(
        `/api/review/submissions/${submission.id}/approve`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${reviewerAccessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            notes: "Looks good"
          })
        },
        env
      );

      expect(approveResponse.status).toBe(200);

      const rewardsResponse = await app.request(
        "/api/students/me/rewards",
        {
          headers: {
            authorization: `Bearer ${studentAccessToken}`
          }
        },
        env
      );
      const rewardsBody = (await rewardsResponse.json()) as {
        rewards: {
          progress: {
            approvedUploads: number;
            lifetimeEarnedKes: number;
            currentCycleApprovedUploads: number;
            currentCycleTargetUploads: number;
            readyCashoutCount: number;
            cashoutReady: boolean;
          };
          cashoutRequests: Array<{ status: string; amountKes: number }>;
        };
      };

      expect(rewardsResponse.status).toBe(200);
      expect(rewardsBody.rewards.progress.approvedUploads).toBe(5);
      expect(rewardsBody.rewards.progress.lifetimeEarnedKes).toBe(100);
      expect(rewardsBody.rewards.progress.currentCycleApprovedUploads).toBe(0);
      expect(rewardsBody.rewards.progress.currentCycleTargetUploads).toBe(5);
      expect(rewardsBody.rewards.progress.readyCashoutCount).toBe(1);
      expect(rewardsBody.rewards.progress.cashoutReady).toBe(true);
      expect(rewardsBody.rewards.cashoutRequests).toHaveLength(1);
      expect(rewardsBody.rewards.cashoutRequests[0]?.status).toBe("ready");
      expect(rewardsBody.rewards.cashoutRequests[0]?.amountKes).toBe(100);

      const reviewerCashoutsResponse = await app.request(
        "/api/review/cashouts",
        {
          headers: {
            authorization: `Bearer ${reviewerAccessToken}`
          }
        },
        env
      );
      const reviewerCashoutsBody = (await reviewerCashoutsResponse.json()) as {
        items: Array<{ studentId: string; status: string; amountKes: number }>;
      };

      expect(reviewerCashoutsResponse.status).toBe(200);
      expect(reviewerCashoutsBody.items.some((item) => item.studentId === student.id && item.status === "ready")).toBe(
        true
      );
    });

    expect(emails.some((email) => email.subject === "Your PaperBank upload was approved")).toBe(true);
    expect(emails.some((email) => email.subject === "Your PaperBank cashout is unlocked")).toBe(true);
    expect(
      emails.some(
        (email) =>
          email.to.includes("reviewer@paperbank.online") &&
          email.subject === "PaperBank cashout ready for Strathmore University"
      )
    ).toBe(true);
    expect(
      emails.some(
        (email) =>
          email.to.includes("admin@paperbank.online") &&
          email.subject === "PaperBank cashout ready for Strathmore University"
      )
    ).toBe(true);

    testDb.close();
    void admin;
  });

  it("lets a student request cashout and lets admin move it through approval and paid states", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);
    testDb.seedInstitution();

    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString(),
      email: "cashout.student@strathmore.edu"
    });
    const reviewer = await testDb.seedStaffUser({
      institutionId: "inst_strathmore",
      email: "reviewer@paperbank.online",
      username: "reviewer-two",
      role: "reviewer",
      status: "active"
    });
    const admin = await testDb.seedStaffUser({
      institutionId: null,
      email: "admin@paperbank.online",
      username: "admin-two",
      role: "admin",
      status: "active"
    });
    const readyCashout = testDb.seedCashoutRequest({
      studentId: student.id,
      status: "ready",
      amountKes: 100,
      approvedUploadCountSnapshot: 5
    });

    const studentAccessToken = await createStudentAccessToken(student.id);
    const reviewerAccessToken = await createStaffAccessToken(reviewer.id, "inst_strathmore", "reviewer");
    const adminAccessToken = await createStaffAccessToken(admin.id, null, "admin");

    const requestResponse = await app.request(
      "/api/students/me/cashouts",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${studentAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          mpesaPhoneNumber: "254700123456"
        })
      },
      env
    );
    const requestBody = (await requestResponse.json()) as {
      success: boolean;
      cashoutRequest: { id: string; status: string; mpesaPhoneNumber: string | null };
      rewards: { progress: { pendingCashoutCount: number; readyCashoutCount: number } };
    };

    expect(requestResponse.status).toBe(200);
    expect(requestBody.cashoutRequest.id).toBe(readyCashout.id);
    expect(requestBody.cashoutRequest.status).toBe("requested");
    expect(requestBody.cashoutRequest.mpesaPhoneNumber).toBe("254700123456");
    expect(requestBody.rewards.progress.pendingCashoutCount).toBe(1);
    expect(requestBody.rewards.progress.readyCashoutCount).toBe(0);

    const reviewerCashoutsResponse = await app.request(
      "/api/review/cashouts",
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const reviewerCashoutsBody = (await reviewerCashoutsResponse.json()) as {
      items: Array<{ id: string; status: string }>;
    };

    expect(reviewerCashoutsResponse.status).toBe(200);
    expect(reviewerCashoutsBody.items.some((item) => item.id === readyCashout.id && item.status === "requested")).toBe(
      true
    );

    const adminPaymentsResponse = await app.request(
      "/api/admin/payments",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const adminPaymentsBody = (await adminPaymentsResponse.json()) as {
      items: Array<{ id: string; status: string }>;
    };

    expect(adminPaymentsResponse.status).toBe(200);
    expect(adminPaymentsBody.items.some((item) => item.id === readyCashout.id && item.status === "requested")).toBe(
      true
    );

    const approvePaymentResponse = await app.request(
      `/api/admin/payments/${readyCashout.id}/approve`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const approvePaymentBody = (await approvePaymentResponse.json()) as {
      success: boolean;
      payment: { status: string };
    };

    expect(approvePaymentResponse.status).toBe(200);
    expect(approvePaymentBody.payment.status).toBe("approved");

    const markPaidResponse = await app.request(
      `/api/admin/payments/${readyCashout.id}/mark-paid`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const markPaidBody = (await markPaidResponse.json()) as {
      success: boolean;
      payment: { status: string };
    };

    expect(markPaidResponse.status).toBe(200);
    expect(markPaidBody.payment.status).toBe("paid");

    testDb.close();
  });
});
