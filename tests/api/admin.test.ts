import { describe, expect, it } from "bun:test";
import app from "../../src";
import { createAuthToken } from "../../src/domains/auth/token";
import { createPdfFixture } from "../support/pdf-fixture";
import { createMockR2Bucket } from "../support/mock-r2";
import { createTestD1 } from "../support/test-d1";

const authSecret = "super-secret-auth-token";

const createAccessToken = async (
  studentId: string,
  institutionId = "inst_strathmore",
  role: "student" | "reviewer" | "admin" = "student"
) => {
  const token = await createAuthToken(studentId, institutionId, role, authSecret);
  return token.token;
};

const createEnv = (db: D1Database, bucket: R2Bucket) => ({
  APP_ENV: "test",
  UPLOAD_REVIEW_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  EMBEDDING_MODEL: "@cf/baai/bge-base-en-v1.5",
  RETRIEVAL_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  AUTH_TOKEN_SECRET: authSecret,
  DB: db,
  PAPERS_BUCKET: bucket
});

const createStoredPdfFile = async () =>
  await createPdfFixture({
    name: "admin-review.pdf",
    pageColor: "white",
    textBlocks: [
      { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
      { text: "Unit Code: BBT 4106", x: 297, y: 690, align: "center", fontSize: 14 },
      { text: "Unit Name: Business Intelligence I", x: 297, y: 660, align: "center", fontSize: 14 },
      { text: "Continuous Assessment Test (CAT) 1", x: 297, y: 630, align: "center", fontSize: 14 }
    ]
  });

describe("admin routes", () => {
  it("blocks a non-admin from the admin control surface", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);

    const response = await app.request(
      "/api/admin/institutions",
      {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      },
      env
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Admin access is required.");
  });

  it("lets an admin operate the cross-institution control surface", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    testDb.seedInstitution({
      id: "inst_other",
      name: "KCA University",
      slug: "kca",
      shortCode: "KCA",
      emailDomain: "kca.ac.ke"
    });

    const admin = testDb.seedStudent({
      admissionNumber: "SCT221-0099/2022",
      email: "admin@strathmore.edu",
      fullName: "Global Admin",
      role: "admin",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const otherStudent = testDb.seedStudent({
      institutionId: "inst_other",
      admissionNumber: "KCA221-0001/2022",
      email: "review.target@kca.ac.ke",
      fullName: "Review Target",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });

    testDb.seedPaper({
      institutionId: "inst_other",
      title: "KCA Database Exam",
      unitCode: "CSC 2101",
      unitName: "Database Systems"
    });
    testDb.seedWaitlistEntry({
      institutionId: "inst_other",
      name: "KCA Waitlist",
      email: "waitlist@kca.ac.ke"
    });

    const submission = testDb.seedUploadSubmission({
      institutionId: "inst_other",
      studentId: otherStudent.id,
      title: "Business Intelligence CAT",
      unitCode: "BBT 4106",
      unitName: "Business Intelligence I",
      paperType: "cat",
      fileKey: "uploads/admin-review.pdf",
      fileHash: "admin-review-file-hash",
      documentFingerprint: "inst_other|bbt4106|cat|2026-05-18|1"
    });

    const storedPdf = await createStoredPdfFile();
    const storedPdfBytes = await storedPdf.arrayBuffer();
    await (bucket as unknown as ReturnType<typeof createMockR2Bucket>).put(
      submission.fileKey,
      storedPdfBytes,
      {
        httpMetadata: {
          contentType: "application/pdf"
        }
      }
    );

    const adminAccessToken = await createAccessToken(admin.id, "inst_strathmore", "admin");

    const institutionsResponse = await app.request(
      "/api/admin/institutions",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const institutionsBody = (await institutionsResponse.json()) as {
      items: Array<{ id: string; name: string }>;
    };

    expect(institutionsResponse.status).toBe(200);
    expect(institutionsBody.items).toHaveLength(2);
    expect(institutionsBody.items.some((item) => item.name === "Strathmore University")).toBe(true);
    expect(institutionsBody.items.some((item) => item.name === "KCA University")).toBe(true);

    const usersResponse = await app.request(
      "/api/admin/users",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const usersBody = (await usersResponse.json()) as {
      items: Array<{ id: string; institutionName: string; role: string }>;
    };

    expect(usersResponse.status).toBe(200);
    expect(usersBody.items.some((item) => item.id === otherStudent.id)).toBe(true);
    expect(usersBody.items.some((item) => item.institutionName === "KCA University")).toBe(true);

    const roleResponse = await app.request(
      `/api/admin/users/${otherStudent.id}/role`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          role: "reviewer"
        })
      },
      env
    );
    const roleBody = (await roleResponse.json()) as {
      success: boolean;
      user: { id: string; role: string };
    };

    expect(roleResponse.status).toBe(200);
    expect(roleBody.success).toBe(true);
    expect(roleBody.user.id).toBe(otherStudent.id);
    expect(roleBody.user.role).toBe("reviewer");

    const reviewQueueResponse = await app.request(
      "/api/admin/review/queue",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const reviewQueueBody = (await reviewQueueResponse.json()) as {
      items: Array<{ id: string; institutionName: string }>;
    };

    expect(reviewQueueResponse.status).toBe(200);
    expect(reviewQueueBody.items.some((item) => item.id === submission.id)).toBe(true);
    expect(reviewQueueBody.items.some((item) => item.institutionName === "KCA University")).toBe(true);

    const approveResponse = await app.request(
      `/api/admin/review/submissions/${submission.id}/approve`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Approved by global admin"
        })
      },
      env
    );
    const approveBody = (await approveResponse.json()) as {
      success: boolean;
      submission: { status: string };
      paper: { institutionId: string; sourceUploadSubmissionId: string | null };
    };

    expect(approveResponse.status).toBe(200);
    expect(approveBody.success).toBe(true);
    expect(approveBody.submission.status).toBe("approved");
    expect(approveBody.paper.institutionId).toBe("inst_other");
    expect(approveBody.paper.sourceUploadSubmissionId).toBe(submission.id);

    const papersResponse = await app.request(
      "/api/admin/papers",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const papersBody = (await papersResponse.json()) as {
      items: Array<{ institutionName: string }>;
    };

    expect(papersResponse.status).toBe(200);
    expect(papersBody.items.some((item) => item.institutionName === "KCA University")).toBe(true);

    const waitlistResponse = await app.request(
      "/api/admin/waitlist",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const waitlistBody = (await waitlistResponse.json()) as {
      items: Array<{ email: string; institutionName: string }>;
    };

    expect(waitlistResponse.status).toBe(200);
    expect(waitlistBody.items).toHaveLength(1);
    expect(waitlistBody.items[0]?.email).toBe("waitlist@kca.ac.ke");
    expect(waitlistBody.items[0]?.institutionName).toBe("KCA University");

    const analyticsResponse = await app.request(
      "/api/admin/analytics/overview",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const analyticsBody = (await analyticsResponse.json()) as {
      overview: {
        institutions: number;
        students: number;
        reviewers: number;
        admins: number;
        approvedPapers: number;
        waitlistEntries: number;
      };
    };

    testDb.close();

    expect(analyticsResponse.status).toBe(200);
    expect(analyticsBody.overview.institutions).toBe(2);
    expect(analyticsBody.overview.students).toBe(2);
    expect(analyticsBody.overview.reviewers).toBe(1);
    expect(analyticsBody.overview.admins).toBe(1);
    expect(analyticsBody.overview.approvedPapers).toBe(2);
    expect(analyticsBody.overview.waitlistEntries).toBe(1);
  }, 20000);
});
