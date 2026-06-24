import { describe, expect, it } from "bun:test";
import app from "../../src";
import { createAuthToken } from "../../src/domains/auth/token";
import { createPdfFixture } from "../support/pdf-fixture";
import { createTestD1 } from "../support/test-d1";
import type { UploadReviewResult } from "../../src/platform/ai/review";

type UploadPrefillResponse = {
  success: boolean;
  file: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    hash: string;
  };
  duplicateCheck: {
    isDuplicate: boolean;
    reason: "none" | "file_hash";
    matchedPaperId: string | null;
    matchedSubmissionId: string | null;
  };
  review: UploadReviewResult | null;
  documentIdentity: {
    unitCode: string | null;
    assessmentType: "cat" | "exam" | "assignment" | "unknown";
    assessmentDate: string | null;
    assessmentNumber: string | null;
    documentFingerprint: string | null;
    isFingerprintReady: boolean;
  } | null;
};

const authSecret = "super-secret-auth-token";
const institutionPrompt = "Target institution: Strathmore University";

const createReviewResponse = (overrides?: {
  institution?: Partial<{
    expected: string;
    detected: string | null;
    matches_expected: boolean;
    confidence: number;
  }>;
  document?: Partial<{
    is_valid_assessment: boolean;
    paper_type: "cat" | "exam" | "assignment" | "unknown";
    confidence: number;
  }>;
  metadata?: Partial<{
    unit_code: string | null;
    unit_name: string | null;
    programme: string | null;
    school: string | null;
    academic_year: string | null;
    date: string | null;
    time: string | null;
    duration: string | null;
    page_marker: string | null;
    title: string | null;
  }>;
  signals?: Partial<{
    header_present: boolean;
    institution_name_present: boolean;
    school_or_faculty_present: boolean;
    programme_present: boolean;
    unit_code_present: boolean;
    unit_name_present: boolean;
    assessment_wording_present: boolean;
    date_present: boolean;
    time_or_duration_present: boolean;
    mark_allocations_present: boolean;
    page_marker_present: boolean;
    formal_assessment_layout_present: boolean;
  }>;
  evidence?: Partial<{
    supporting_signals: string[];
    contradicting_signals: string[];
  }>;
  decision?: Partial<{
    status: "accept" | "review" | "reject";
    message: string;
  }>;
}) => ({
  institution: {
    expected: "Strathmore University",
    detected: "Strathmore University",
    matches_expected: true,
    confidence: 0.98,
    ...overrides?.institution
  },
  document: {
    is_valid_assessment: true,
    paper_type: "cat",
    confidence: 0.97,
    ...overrides?.document
  },
  metadata: {
    unit_code: "BIT 2205",
    unit_name: "Database Systems",
    programme: "Bachelor of Business Information Technology",
    school: "School of Computing and Engineering Sciences",
    academic_year: "2023/2024",
    date: "2026-05-11",
    time: "09:00",
    duration: "1 Hour",
    page_marker: "Page 1 of 1",
    title: "Database Systems CAT",
    ...overrides?.metadata
  },
  signals: {
    header_present: true,
    institution_name_present: true,
    school_or_faculty_present: true,
    programme_present: true,
    unit_code_present: true,
    unit_name_present: true,
    assessment_wording_present: true,
    date_present: true,
    time_or_duration_present: true,
    mark_allocations_present: true,
    page_marker_present: true,
    formal_assessment_layout_present: true,
    ...overrides?.signals
  },
  evidence: {
    supporting_signals: ["Strathmore header", "unit code", "CAT wording"],
    contradicting_signals: [],
    ...overrides?.evidence
  },
  decision: {
    status: "accept",
    message: "This appears to be a valid Strathmore assessment document.",
    ...overrides?.decision
  }
});

const createAiBinding = ({
  markdown = "Strathmore University\nUnit Code: BIT 2205\nDatabase Systems\nCAT\nPage 1 of 1",
  response = JSON.stringify(createReviewResponse())
}: {
  markdown?: string;
  response?: unknown;
} = {}) => ({
  toMarkdown: async () => ({
    format: "markdown",
    data: markdown
  }),
  run: async () => response
});

const createEnv = (
  db: D1Database,
  overrides?: {
    AI?: {
      toMarkdown?: (file: { name: string; blob: Blob }, options?: unknown) => Promise<unknown>;
      run?: (model: string, payload: unknown) => Promise<unknown>;
    };
  }
) => ({
  APP_ENV: "test",
  UPLOAD_REVIEW_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  EMBEDDING_MODEL: "@cf/baai/bge-base-en-v1.5",
  RETRIEVAL_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  AUTH_TOKEN_SECRET: authSecret,
  DB: db,
  AI: overrides?.AI
});

const createAccessToken = async (studentId: string, institutionId = "inst_strathmore") => {
  const token = await createAuthToken(studentId, institutionId, authSecret);
  return token.token;
};

const createExamPdfFile = async (name = "database-systems.pdf", pageColor: "white" | "yellow" = "yellow") =>
  await createPdfFixture({
    name,
    pageColor,
    textBlocks: [
      { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
      { text: "School of Computing and Engineering Sciences", x: 297, y: 730, align: "center", fontSize: 13 },
      { text: "Bachelor of Business Information Technology", x: 297, y: 705, align: "center", fontSize: 12 },
      { text: "Unit Code: BIT 2205", x: 297, y: 675, align: "center", fontSize: 14 },
      { text: "Unit Name: Database Systems", x: 297, y: 648, align: "center", fontSize: 14 },
      { text: "Paper Type: End Semester Exam", x: 297, y: 620, align: "center", fontSize: 13 },
      { text: "Academic Year: 2023/2024", x: 297, y: 594, align: "center", fontSize: 12 },
      { text: "Date: 11th May 2026", x: 72, y: 560, align: "left", fontSize: 13 },
      { text: "Time: 1 Hour", x: 520, y: 560, align: "right", fontSize: 13 }
    ]
  });

describe("upload prefill route", () => {
  it("returns file details for a valid uploaded pdf", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
      uploadReviewPrompt: institutionPrompt
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", await createExamPdfFile());

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db, {
        AI: createAiBinding()
      })
    );
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.file.name).toBe("database-systems.pdf");
    expect(body.file.mimeType).toBe("application/pdf");
    expect(body.file.hash).toBeString();
    expect(body.duplicateCheck.isDuplicate).toBe(false);
    expect(body.duplicateCheck.reason).toBe("none");
    expect(body.review?.decision.status).toBe("accept");
    expect(body.review?.metadata.unitCode).toBe("BIT 2205");
    expect(body.documentIdentity).toEqual({
      unitCode: "bit2205",
      assessmentType: "cat",
      assessmentDate: "2026-05-11",
      assessmentNumber: null,
      documentFingerprint: "inst_strathmore|bit2205|cat|2026-05-11|unknown",
      isFingerprintReady: true
    });
  }, 15000);

  it("rejects requests without a pdf file", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("title", "Missing File");

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db)
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toContain("pdf file is required");
  });

  it("rejects an exact duplicate against approved papers by file hash", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
      uploadReviewPrompt: institutionPrompt
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const duplicateFile = await createExamPdfFile();
    const duplicateBytes = await duplicateFile.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", duplicateBytes);
    const duplicateHash = Array.from(new Uint8Array(hashBuffer))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");

    const seededPaper = testDb.seedPaper({
      fileHash: duplicateHash
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", duplicateFile);

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db)
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toBe("This PDF already exists in PaperBank as an approved paper.");
  }, 15000);

  it("does not reject because the same file is already in upload submissions", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
      uploadReviewPrompt: institutionPrompt
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const duplicateFile = await createExamPdfFile();
    const duplicateBytes = await duplicateFile.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", duplicateBytes);
    const duplicateHash = Array.from(new Uint8Array(hashBuffer))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");

    testDb.seedUploadSubmission({
      fileHash: duplicateHash
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", duplicateFile);

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db, {
        AI: createAiBinding()
      })
    );
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.duplicateCheck.isDuplicate).toBe(false);
    expect(body.review?.decision.status).toBe("accept");
  }, 15000);

  it("requires an institution upload review prompt", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
      id: "inst_other",
      name: "Other University",
      slug: "other",
      shortCode: "OU",
      emailDomain: "other.edu"
    });
    const student = testDb.seedStudent({
      institutionId: "inst_other",
      email: "test.student@other.edu",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id, "inst_other");
    const formData = new FormData();

    formData.set("file", await createExamPdfFile("other-university.pdf"));

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db)
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Upload review prompt is not configured for this institution.");
  }, 15000);

  it("rejects uploads when the model rejects the document", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
      uploadReviewPrompt: institutionPrompt
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", await createExamPdfFile("wrong-document.pdf"));

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db, {
        AI: createAiBinding({
          response: JSON.stringify(
            createReviewResponse({
              document: {
                is_valid_assessment: false,
                paper_type: "unknown",
                confidence: 0.94
              },
              decision: {
                status: "reject",
                message:
                  "This PDF does not appear to be a valid Strathmore assessment document. Please upload a correct Strathmore CAT or exam paper."
              }
            })
          )
        })
      })
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.message).toBe(
      "This PDF does not appear to be a valid Strathmore assessment document. Please upload a correct Strathmore CAT or exam paper."
    );
  }, 15000);

  it("rejects uploads that are not cat or exam papers", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
      uploadReviewPrompt: institutionPrompt
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", await createExamPdfFile("assignment.pdf"));

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db, {
        AI: createAiBinding({
          response: JSON.stringify(
            createReviewResponse({
              document: {
                paper_type: "assignment"
              },
              decision: {
                status: "accept",
                message: "This appears to be a valid Strathmore assessment document."
              }
            })
          )
        })
      })
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.message).toBe(
      "This document does not appear to be a valid Strathmore University CAT or exam paper. Please upload a correct assessment document."
    );
  }, 15000);

  it("returns review when required fingerprint fields are missing", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
      uploadReviewPrompt: institutionPrompt
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", await createExamPdfFile("missing-date.pdf"));

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db, {
        AI: createAiBinding({
          response: JSON.stringify(
            createReviewResponse({
              metadata: {
                date: null
              },
              decision: {
                status: "accept",
                message: "This appears to be a valid Strathmore assessment document."
              }
            })
          )
        })
      })
    );
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.review?.decision.status).toBe("review");
    expect(body.documentIdentity).toEqual({
      unitCode: "bit2205",
      assessmentType: "cat",
      assessmentDate: null,
      assessmentNumber: null,
      documentFingerprint: null,
      isFingerprintReady: false
    });
  }, 15000);

  it("rejects duplicate content against approved papers by fingerprint", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
      uploadReviewPrompt: institutionPrompt
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    testDb.seedPaper({
      fileHash: "different-approved-file-hash",
      documentFingerprint: "inst_strathmore|bit2205|cat|2026-05-11|unknown"
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", await createExamPdfFile("same-paper-new-scan.pdf"));

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db, {
        AI: createAiBinding()
      })
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toBe(
      "This assessment paper already exists in PaperBank as an approved paper."
    );
  }, 15000);

  it("fails cleanly when the model returns invalid json", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
      uploadReviewPrompt: institutionPrompt
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", await createExamPdfFile("invalid-json.pdf"));

    const response = await app.request(
      "/api/uploads/prefill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: formData
      },
      createEnv(testDb.db, {
        AI: createAiBinding({
          response: {
            response: "this is not json"
          }
        })
      })
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Upload review model returned invalid JSON.");
  }, 15000);
});
