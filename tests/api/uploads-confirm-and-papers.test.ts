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

const createExamPdfFile = async (name = "database-systems.pdf") =>
  await createPdfFixture({
    name,
    pageColor: "yellow",
    textBlocks: [
      { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
      { text: "School of Computing and Engineering Sciences", x: 297, y: 730, align: "center", fontSize: 13 },
      { text: "Unit Code: BIT 2205", x: 297, y: 675, align: "center", fontSize: 14 },
      { text: "Unit Name: Database Systems", x: 297, y: 648, align: "center", fontSize: 14 },
      { text: "Paper Type: End Semester Exam", x: 297, y: 620, align: "center", fontSize: 13 },
      { text: "Academic Year: 2023/2024", x: 297, y: 594, align: "center", fontSize: 12 },
      { text: "Date: 11th May 2026", x: 72, y: 560, align: "left", fontSize: 13 },
      { text: "Time: 1 Hour", x: 520, y: 560, align: "right", fontSize: 13 }
    ]
  });

const createCustomPdfFile = async (
  name: string,
  textBlocks: Array<{
    text: string;
    x: number;
    y: number;
    align?: "left" | "center" | "right";
    fontSize?: number;
  }>
) =>
  await createPdfFixture({
    name,
    pageColor: "yellow",
    textBlocks
  });

describe("upload confirm and paper retrieval flow", () => {
  it("stores the original pdf, creates a submission, approves it, and serves the same file back", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const reviewer = testDb.seedStudent({
      admissionNumber: "SCT221-0099/2022",
      email: "reviewer@strathmore.edu",
      fullName: "Reviewer User",
      role: "reviewer",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const reviewerAccessToken = await createAccessToken(reviewer.id, "inst_strathmore", "reviewer");
    const file = await createExamPdfFile();
    const originalBytes = await file.arrayBuffer();
    const formData = new FormData();

    formData.set("file", file);
    formData.set("unitCode", "BIT 2205");
    formData.set("unitName", "Database Systems");
    formData.set("paperType", "exam");
    formData.set("title", "Database Systems Exam");
    formData.set("modelLabel", "accept");
    formData.set("modelConfidence", "0.93");
    formData.set(
      "modelMetadataJson",
      JSON.stringify({
        institution: {
          detected: "Strathmore University"
        }
      })
    );
    formData.set("reviewedByModelAt", "2026-06-24T11:00:00.000Z");
    formData.set("documentFingerprint", "inst_strathmore|bit2205|exam|2026-05-11|unknown");

    const confirmResponse = await app.request(
      "/api/uploads/confirm",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      env
    );
    const confirmBody = (await confirmResponse.json()) as {
      success: boolean;
      submission: {
        id: string;
        institutionId: string;
        studentId: string;
        title: string;
        unitCode: string;
        unitName: string;
        paperType: string;
        academicYear: string | null;
        fileKey: string;
        fileHash: string;
        modelLabel: string | null;
        modelConfidence: number | null;
        modelMetadataJson: string | null;
        reviewedByModelAt: string | null;
        documentFingerprint: string | null;
        status: string;
      };
    };

    expect(confirmResponse.status).toBe(200);
    expect(confirmBody.success).toBe(true);
    expect(confirmBody.submission.status).toBe("submitted");
    expect(confirmBody.submission.studentId).toBe(student.id);
    expect(confirmBody.submission.fileKey).toContain("upload-submissions");
    expect(confirmBody.submission.modelLabel).toBe("accept");
    expect(confirmBody.submission.modelConfidence).toBe(0.93);
    expect(confirmBody.submission.modelMetadataJson).toContain("Strathmore University");
    expect(confirmBody.submission.reviewedByModelAt).toBe("2026-06-24T11:00:00.000Z");
    expect(confirmBody.submission.documentFingerprint).toBe(
      "inst_strathmore|bit2205|exam|2026-05-11|unknown"
    );

    const storedUpload = await (bucket as unknown as ReturnType<typeof createMockR2Bucket>).get(
      confirmBody.submission.fileKey
    );

    expect(storedUpload).not.toBeNull();
    expect(await storedUpload?.arrayBuffer()).toEqual(originalBytes);

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
    expect(queueBody.items.some((item) => item.id === confirmBody.submission.id)).toBe(true);

    const approveResponse = await app.request(
      `/api/review/submissions/${confirmBody.submission.id}/approve`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Approved for demo"
        })
      },
      env
    );
    const approveBody = (await approveResponse.json()) as {
      success: boolean;
      submission: {
        id: string;
        status: string;
      };
      paper: {
        id: string;
        sourceUploadSubmissionId: string | null;
        fileKey: string;
        documentFingerprint: string | null;
      };
    };

    expect(approveResponse.status).toBe(200);
    expect(approveBody.success).toBe(true);
    expect(approveBody.submission.status).toBe("approved");
    expect(approveBody.paper.sourceUploadSubmissionId).toBe(confirmBody.submission.id);
    expect(approveBody.paper.fileKey).toBe(confirmBody.submission.fileKey);
    expect(approveBody.paper.documentFingerprint).toBe(
      "inst_strathmore|bit2205|exam|2026-05-11|unknown"
    );

    const papersResponse = await app.request(
      "/api/papers?query=bit%202205",
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const papersBody = (await papersResponse.json()) as {
      domain: string;
      items: Array<{ id: string; unitCode: string }>;
    };

    expect(papersResponse.status).toBe(200);
    expect(papersBody.items).toHaveLength(1);
    expect(papersBody.items[0]?.id).toBe(approveBody.paper.id);
    expect(papersBody.items[0]?.unitCode).toBe("BIT 2205");

    const paperResponse = await app.request(
      `/api/papers/${approveBody.paper.id}`,
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const paperBody = (await paperResponse.json()) as {
      success: boolean;
      paper: {
        id: string;
        documentFingerprint: string | null;
      };
    };

    expect(paperResponse.status).toBe(200);
    expect(paperBody.paper.documentFingerprint).toBe(
      "inst_strathmore|bit2205|exam|2026-05-11|unknown"
    );

    const fileResponse = await app.request(
      `/api/papers/${approveBody.paper.id}/file`,
      {
        headers: {
          authorization: `Bearer ${reviewerAccessToken}`
        }
      },
      env
    );
    const downloadedBytes = await fileResponse.arrayBuffer();

    expect(fileResponse.status).toBe(200);
    expect(fileResponse.headers.get("content-type")).toBe("application/pdf");
    expect(downloadedBytes).toEqual(originalBytes);

    testDb.close();
  }, 20000);

  it("blocks a normal student from accessing the review queue", async () => {
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
      "/api/review/queue",
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
    expect(body.message).toBe("Reviewer access is required.");
  });

  it("allows an admin to see review submissions across institutions", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    testDb.seedInstitution({
      id: "inst_other",
      name: "Other University",
      slug: "other",
      shortCode: "OU",
      emailDomain: "other.edu"
    });
    const admin = testDb.seedStudent({
      admissionNumber: "SCT221-0009/2022",
      email: "admin@strathmore.edu",
      fullName: "Global Admin",
      role: "admin",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const otherInstitutionStudent = testDb.seedStudent({
      institutionId: "inst_other",
      admissionNumber: "OTH221-0001/2022",
      email: "review.target@other.edu",
      fullName: "Other Institution Student",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });

    testDb.seedUploadSubmission({
      institutionId: "inst_strathmore",
      studentId: admin.id,
      title: "Strathmore Queue Paper"
    });
    testDb.seedUploadSubmission({
      institutionId: "inst_other",
      studentId: otherInstitutionStudent.id,
      title: "Other Institution Queue Paper"
    });

    const adminAccessToken = await createAccessToken(admin.id, "inst_strathmore", "admin");

    const response = await app.request(
      "/api/review/queue",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const body = (await response.json()) as {
      items: Array<{ institutionId: string; title: string }>;
    };

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.items.some((item) => item.institutionId === "inst_strathmore")).toBe(true);
    expect(body.items.some((item) => item.institutionId === "inst_other")).toBe(true);
    expect(body.items.some((item) => item.title === "Other Institution Queue Paper")).toBe(true);
  });

  it("allows an admin to approve a submission from another institution", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    testDb.seedInstitution({
      id: "inst_other",
      name: "Other University",
      slug: "other",
      shortCode: "OU",
      emailDomain: "other.edu"
    });
    const admin = testDb.seedStudent({
      admissionNumber: "SCT221-0010/2022",
      email: "admin.approver@strathmore.edu",
      fullName: "Approver Admin",
      role: "admin",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const otherInstitutionStudent = testDb.seedStudent({
      institutionId: "inst_other",
      admissionNumber: "OTH221-0002/2022",
      email: "submitter@other.edu",
      fullName: "Other Submitter",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const otherInstitutionSubmission = testDb.seedUploadSubmission({
      institutionId: "inst_other",
      studentId: otherInstitutionStudent.id,
      fileKey: "inst_other/upload-submissions/other-paper.pdf",
      fileHash: "other-institution-file-hash",
      title: "Other Institution Exam",
      unitCode: "OTH 1001",
      unitName: "Other Institution Unit",
      paperType: "exam"
    });

    const file = await createExamPdfFile("other-approved.pdf");
    const originalBytes = await file.arrayBuffer();
    await (bucket as unknown as ReturnType<typeof createMockR2Bucket>).put(
      otherInstitutionSubmission.fileKey,
      originalBytes,
      {
        httpMetadata: {
          contentType: "application/pdf",
          contentDisposition: 'inline; filename="other-approved.pdf"'
        },
        customMetadata: {
          institutionId: "inst_other",
          studentId: otherInstitutionStudent.id,
          kind: "upload_submission"
        }
      }
    );

    const adminAccessToken = await createAccessToken(admin.id, "inst_strathmore", "admin");

    const response = await app.request(
      `/api/review/submissions/${otherInstitutionSubmission.id}/approve`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Approved globally"
        })
      },
      env
    );
    const body = (await response.json()) as {
      success: boolean;
      submission: { status: string };
      paper: { institutionId: string; sourceUploadSubmissionId: string | null };
    };

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.submission.status).toBe("approved");
    expect(body.paper.institutionId).toBe("inst_other");
    expect(body.paper.sourceUploadSubmissionId).toBe(otherInstitutionSubmission.id);
  });

  it("rejects confirming the same exact pdf twice", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const file = await createExamPdfFile("duplicate.pdf");

    const createFormData = () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("unitCode", "BIT 2205");
      formData.set("unitName", "Database Systems");
      formData.set("paperType", "exam");
      return formData;
    };

    const firstResponse = await app.request(
      "/api/uploads/confirm",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: createFormData()
      },
      env
    );

    expect(firstResponse.status).toBe(200);

    const secondResponse = await app.request(
      "/api/uploads/confirm",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: createFormData()
      },
      env
    );
    const secondBody = (await secondResponse.json()) as {
      success: boolean;
      message: string;
    };

    expect(secondResponse.status).toBe(409);
    expect(secondBody.success).toBe(false);
    expect(secondBody.message).toContain("already been submitted");

    testDb.close();
  }, 20000);

  it("supports chat-style hybrid search across metadata and approved paper content", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const reviewer = testDb.seedStudent({
      admissionNumber: "SCT221-0100/2022",
      email: "search.reviewer@strathmore.edu",
      fullName: "Search Reviewer",
      role: "reviewer",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const reviewerAccessToken = await createAccessToken(reviewer.id, "inst_strathmore", "reviewer");

    const createConfirmedSubmission = async (file: File, fields: Record<string, string>) => {
      const formData = new FormData();
      formData.set("file", file);

      for (const [key, value] of Object.entries(fields)) {
        formData.set(key, value);
      }

      const response = await app.request(
        "/api/uploads/confirm",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`
          },
          body: formData
        },
        env
      );
      const body = (await response.json()) as {
        submission: {
          id: string;
        };
      };

      expect(response.status).toBe(200);

      const approveResponse = await app.request(
        `/api/review/submissions/${body.submission.id}/approve`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${reviewerAccessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({})
        },
        env
      );

      expect(approveResponse.status).toBe(200);
    };

    await createConfirmedSubmission(await createCustomPdfFile("db-cat-2023.pdf", [
      { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
      { text: "Unit Code: BIT 2205", x: 297, y: 700, align: "center", fontSize: 14 },
      { text: "Unit Name: Database Systems", x: 297, y: 672, align: "center", fontSize: 14 },
      { text: "Paper Type: CAT", x: 297, y: 644, align: "center", fontSize: 14 },
      { text: "Academic Year: 2023/2024", x: 297, y: 616, align: "center", fontSize: 12 },
      { text: "Normalization, indexing, and joins.", x: 72, y: 540, align: "left", fontSize: 12 }
    ]), {
      unitCode: "BIT 2205",
      unitName: "Database Systems",
      paperType: "cat",
      academicYear: "2023/2024",
      title: "Database Systems CAT 2023/2024"
    });

    await createConfirmedSubmission(await createCustomPdfFile("db-cat-2024.pdf", [
      { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
      { text: "Unit Code: BIT 2205", x: 297, y: 700, align: "center", fontSize: 14 },
      { text: "Unit Name: Database Systems", x: 297, y: 672, align: "center", fontSize: 14 },
      { text: "Paper Type: CAT", x: 297, y: 644, align: "center", fontSize: 14 },
      { text: "Academic Year: 2024/2025", x: 297, y: 616, align: "center", fontSize: 12 },
      { text: "Transactions, concurrency, and query optimization.", x: 72, y: 540, align: "left", fontSize: 12 }
    ]), {
      unitCode: "BIT 2205",
      unitName: "Database Systems",
      paperType: "cat",
      academicYear: "2024/2025",
      title: "Database Systems CAT 2024/2025"
    });

    await createConfirmedSubmission(await createCustomPdfFile("diabetes-research.pdf", [
      { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
      { text: "Unit Code: RES 4100", x: 297, y: 700, align: "center", fontSize: 14 },
      { text: "Unit Name: Health Informatics Research", x: 297, y: 672, align: "center", fontSize: 14 },
      { text: "Paper Type: Research", x: 297, y: 644, align: "center", fontSize: 14 },
      { text: "Academic Year: 2025/2026", x: 297, y: 616, align: "center", fontSize: 12 },
      { text: "This paper studies diabetes screening, glucose risk prediction, and patient outcomes.", x: 72, y: 540, align: "left", fontSize: 12 }
    ]), {
      unitCode: "RES 4100",
      unitName: "Health Informatics Research",
      paperType: "research",
      academicYear: "2025/2026",
      title: "Research Paper on Diabetes Screening"
    });

    const latestCatResponse = await app.request(
      "/api/search",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query: "show me the latest CAT for Database Systems"
        })
      },
      env
    );
    const latestCatBody = (await latestCatResponse.json()) as {
      results: Array<{
        title: string;
        academicYear: string | null;
      }>;
    };

    expect(latestCatResponse.status).toBe(200);
    expect(latestCatBody.results[0]?.title).toBe("Database Systems CAT 2024/2025");
    expect(latestCatBody.results[0]?.academicYear).toBe("2024/2025");

    const diabetesResponse = await app.request(
      "/api/search",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query: "I am looking for research papers on diabetes"
        })
      },
      env
    );
    const diabetesBody = (await diabetesResponse.json()) as {
      results: Array<{
        title: string;
        paperType: string;
        snippet: string;
      }>;
    };

    expect(diabetesResponse.status).toBe(200);
    expect(diabetesBody.results[0]?.title).toBe("Research Paper on Diabetes Screening");
    expect(diabetesBody.results[0]?.paperType).toBe("research");
    expect(diabetesBody.results[0]?.snippet.toLowerCase()).toContain("diabetes");

    testDb.close();
  }, 25000);
});
