import { describe, expect, it } from "bun:test";
import app from "../../src";
import { createStaffAuthToken } from "../../src/domains/staff-auth/token";
import { createPdfFixture } from "../support/pdf-fixture";
import { createMockR2Bucket } from "../support/mock-r2";
import { createTestD1 } from "../support/test-d1";

const staffAuthSecret = "super-secret-staff-auth-token";

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
  STAFF_AUTH_TOKEN_SECRET: staffAuthSecret,
  DB: db,
  PAPERS_BUCKET: bucket
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

describe("reviewer routes", () => {
  it("lets a reviewer inspect, hold, reject, and download submissions in their institution", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    const reviewer = await testDb.seedStaffUser({
      institutionId: "inst_strathmore",
      email: "reviewer@paperbank.online",
      username: "reviewer-one",
      role: "reviewer",
      status: "active"
    });
    const submission = testDb.seedUploadSubmission({
      title: "Business Intelligence CAT",
      unitCode: "BBT 4106",
      unitName: "Business Intelligence I",
      paperType: "cat",
      fileKey: "uploads/reviewer-submission.pdf",
      fileName: "reviewer-submission.pdf"
    });

    const storedPdf = await createStoredPdfFile("reviewer-submission.pdf");
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

    const reviewerAccessToken = await createStaffAccessToken(reviewer.id, "inst_strathmore", "reviewer");

    const detailResponse = await app.request(
      `/api/review/submissions/${submission.id}`,
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const detailBody = (await detailResponse.json()) as {
      success: boolean;
      submission: { id: string; status: string };
      decisions: Array<{ decision: string }>;
    };

    expect(detailResponse.status).toBe(200);
    expect(detailBody.success).toBe(true);
    expect(detailBody.submission.id).toBe(submission.id);
    expect(detailBody.decisions).toHaveLength(0);

    const fileResponse = await app.request(
      `/api/review/submissions/${submission.id}/file`,
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );

    expect(fileResponse.status).toBe(200);
    expect(await fileResponse.arrayBuffer()).toEqual(storedPdfBytes);

    const holdResponse = await app.request(
      `/api/review/submissions/${submission.id}/hold`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Need another look"
        })
      },
      env
    );
    const holdBody = (await holdResponse.json()) as {
      success: boolean;
      submission: { status: string };
      decision: { decision: string; notes: string | null } | null;
    };

    expect(holdResponse.status).toBe(200);
    expect(holdBody.submission.status).toBe("in_review");
    expect(holdBody.decision?.decision).toBe("in_review");

    const queueResponse = await app.request(
      "/api/review/queue",
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const queueBody = (await queueResponse.json()) as {
      items: Array<{ id: string; status: string }>;
    };

    expect(queueResponse.status).toBe(200);
    expect(queueBody.items.some((item) => item.id === submission.id && item.status === "in_review")).toBe(
      true
    );

    const rejectResponse = await app.request(
      `/api/review/submissions/${submission.id}/reject`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Rejected after review"
        })
      },
      env
    );
    const rejectBody = (await rejectResponse.json()) as {
      success: boolean;
      submission: { status: string };
      decision: { decision: string; notes: string | null } | null;
    };

    expect(rejectResponse.status).toBe(200);
    expect(rejectBody.submission.status).toBe("rejected");
    expect(rejectBody.decision?.decision).toBe("rejected");

    testDb.close();
  });

  it("lets a reviewer inspect, download, and archive papers in their institution", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    const reviewer = await testDb.seedStaffUser({
      institutionId: "inst_strathmore",
      email: "reviewer@paperbank.online",
      username: "reviewer-one",
      role: "reviewer",
      status: "active"
    });
    const submission = testDb.seedUploadSubmission({
      id: "sub-review-paper"
    });
    const paper = testDb.seedPaper({
      sourceUploadSubmissionId: submission.id,
      fileKey: "papers/reviewer-paper.pdf",
      title: "Business Intelligence CAT"
    });

    const storedPdf = await createStoredPdfFile("reviewer-paper.pdf");
    const storedPdfBytes = await storedPdf.arrayBuffer();
    await (bucket as unknown as ReturnType<typeof createMockR2Bucket>).put(paper.fileKey, storedPdfBytes, {
      httpMetadata: {
        contentType: "application/pdf"
      }
    });

    const reviewerAccessToken = await createStaffAccessToken(reviewer.id, "inst_strathmore", "reviewer");

    const papersResponse = await app.request(
      "/api/review/papers",
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const papersBody = (await papersResponse.json()) as {
      items: Array<{ id: string; status: string }>;
    };

    expect(papersResponse.status).toBe(200);
    expect(papersBody.items.some((item) => item.id === paper.id && item.status === "available")).toBe(true);

    const paperResponse = await app.request(
      `/api/review/papers/${paper.id}`,
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const paperBody = (await paperResponse.json()) as {
      success: boolean;
      paper: { id: string; status: string };
    };

    expect(paperResponse.status).toBe(200);
    expect(paperBody.paper.id).toBe(paper.id);

    const fileResponse = await app.request(
      `/api/review/papers/${paper.id}/file`,
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );

    expect(fileResponse.status).toBe(200);
    expect(await fileResponse.arrayBuffer()).toEqual(storedPdfBytes);

    const archiveResponse = await app.request(
      `/api/review/papers/${paper.id}/archive`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Archive the older copy"
        })
      },
      env
    );
    const archiveBody = (await archiveResponse.json()) as {
      success: boolean;
      paper: { status: string };
    };

    expect(archiveResponse.status).toBe(200);
    expect(archiveBody.paper.status).toBe("archived");

    testDb.close();
  });

  it("blocks a reviewer from another institution and keeps the placeholder route explicit", async () => {
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

    const reviewer = await testDb.seedStaffUser({
      institutionId: "inst_strathmore",
      email: "reviewer@paperbank.online",
      username: "reviewer-one",
      role: "reviewer",
      status: "active"
    });
    const otherSubmission = testDb.seedUploadSubmission({
      institutionId: "inst_other"
    });

    const reviewerAccessToken = await createStaffAccessToken(reviewer.id, "inst_strathmore", "reviewer");

    const forbiddenResponse = await app.request(
      `/api/review/submissions/${otherSubmission.id}`,
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const forbiddenBody = (await forbiddenResponse.json()) as {
      success: boolean;
      message: string;
    };

    expect(forbiddenResponse.status).toBe(404);
    expect(forbiddenBody.success).toBe(false);
    expect(forbiddenBody.message).toBe("Upload submission was not found.");

    const placeholderResponse = await app.request(
      `/api/review/submissions/${otherSubmission.id}/context`,
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const placeholderBody = (await placeholderResponse.json()) as {
      success: boolean;
      message: string;
    };

    expect(placeholderResponse.status).toBe(501);
    expect(placeholderBody.success).toBe(false);
    expect(placeholderBody.message).toBe("Reviewer submission context is not implemented yet.");

    testDb.close();
  });
});
