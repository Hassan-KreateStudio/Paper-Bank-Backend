import { afterEach, describe, expect, it } from "bun:test";
import app from "../../src";
import { createAuthToken } from "../../src/domains/auth/token";
import { pdfRenderer } from "../../src/platform/pdf/render-pdf-pages";
import { createPdfFixture } from "../support/pdf-fixture";
import { createTestD1 } from "../support/test-d1";

type UploadPrefillResponse = {
  success: true;
  file: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    hash: string;
  };
  modelReview: {
    label: "accept" | "review" | "reject";
    confidence: number;
    evidence: string[];
    warnings: string[];
  };
  extracted: {
    institutionName: string | null;
    unitCode: string | null;
    unitName: string | null;
    paperType: "cat" | "exam" | "assignment" | "other" | null;
    assessmentDate: string | null;
    assessmentNumber: string | null;
    title: string | null;
  };
  documentFingerprint: string | null;
  duplicateCheck: {
    isDuplicate: false;
    reason: "none" | "file_hash" | "document_fingerprint";
    matchedPaperId: string | null;
    matchedSubmissionId: string | null;
  };
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
  response = JSON.stringify(createReviewResponse()),
  onRun
}: {
  response?: unknown;
  onRun?: (model: string, payload: unknown) => void;
} = {}) => ({
  run: async (model: string, payload: unknown) => {
    onRun?.(model, payload);
    return response;
  }
});

const createEnv = (
  db: D1Database,
  overrides?: {
    AI?: {
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
  AI: overrides?.AI,
  BROWSER: {
    fetch: fetch
  }
});

const createAccessToken = async (
  studentId: string,
  institutionId = "inst_strathmore",
  role: "student" | "reviewer" | "admin" = "student"
) => {
  const token = await createAuthToken(studentId, institutionId, role, authSecret);
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
  const originalRenderPdfPages = pdfRenderer.renderPdfPages;

  afterEach(() => {
    pdfRenderer.renderPdfPages = originalRenderPdfPages;
  });

  it("returns file details for a valid uploaded pdf", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();
    let capturedPayload: unknown;

    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];

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
        AI: createAiBinding({
          onRun: (_, payload) => {
            capturedPayload = payload;
          }
        })
      })
    );
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.file.name).toBe("database-systems.pdf");
    expect(body.file.mimeType).toBe("application/pdf");
    expect(body.file.hash).toBeString();
    expect(capturedPayload).toMatchObject({
      messages: [
        { role: "system" },
        {
          role: "user",
          content: [
            { type: "text" },
            {
              type: "text",
              text: "PDF page 1"
            },
            {
              type: "image_url",
              image_url: {
                url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
              }
            }
          ]
        }
      ]
    });
    expect(body.duplicateCheck.isDuplicate).toBe(false);
    expect(body.duplicateCheck.reason).toBe("none");
    expect(body.modelReview).toEqual({
      label: "accept",
      confidence: 0.97,
      evidence: ["Strathmore header", "unit code", "CAT wording"],
      warnings: []
    });
    expect(body.extracted).toEqual({
      institutionName: "Strathmore University",
      unitCode: "BIT 2205",
      unitName: "Database Systems",
      paperType: "cat",
      assessmentDate: "2026-05-11",
      assessmentNumber: null,
      title: "Database Systems CAT"
    });
    expect(body.documentFingerprint).toBe("inst_strathmore|bit2205|cat|2026-05-11|unknown");
  }, 15000);

  it("accepts guided json returned directly as an object", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];

    formData.set("file", await createExamPdfFile("guided-object.pdf"));

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
          response: createReviewResponse()
        })
      })
    );
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.file.name).toBe("guided-object.pdf");
    expect(body.modelReview.label).toBe("accept");
    expect(body.extracted.unitCode).toBe("BIT 2205");
  });

  it("accepts openai-style choices response output", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution({
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];

    formData.set("file", await createExamPdfFile("choices-response.pdf"));

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
            choices: [
              {
                message: {
                  content: JSON.stringify(createReviewResponse())
                }
              }
            ]
          }
        })
      })
    );
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.file.name).toBe("choices-response.pdf");
    expect(body.modelReview.label).toBe("accept");
    expect(body.documentFingerprint).toBe("inst_strathmore|bit2205|cat|2026-05-11|unknown");
  });

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
    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];
    const testDb = createTestD1();
    testDb.seedInstitution({
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
    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];
    const testDb = createTestD1();
    testDb.seedInstitution({
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
    expect(body.modelReview.label).toBe("accept");
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
    expect(body.message).toBe("Something went wrong on our side. Please try again.");
  }, 15000);

  it("rejects uploads when the model rejects the document", async () => {
    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];
    const testDb = createTestD1();
    testDb.seedInstitution({
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
                  "The document is a personal CV/Resume and does not constitute an academic assessment document."
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
      "The document is a personal CV/Resume and does not constitute a Strathmore University academic assessment document."
    );
  }, 15000);

  it("rejects academic papers from the wrong institution with an institution-specific message", async () => {
    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];
    const testDb = createTestD1();
    testDb.seedInstitution({
    });
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", await createExamPdfFile("wrong-institution.pdf"));

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
              institution: {
                detected: "Harvard University",
                matches_expected: false
              },
              decision: {
                status: "reject",
                message: "This appears to be an academic assessment document, but it belongs to another university."
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
      "This appears to be an academic assessment document, but it does not appear to belong to Strathmore University. Please upload a valid Strathmore University assessment paper."
    );
  }, 15000);

  it("rejects uploads that are not cat or exam papers", async () => {
    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];
    const testDb = createTestD1();
    testDb.seedInstitution({
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
    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];
    const testDb = createTestD1();
    testDb.seedInstitution({
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
    expect(body.modelReview.label).toBe("review");
    expect(body.extracted).toEqual({
      institutionName: "Strathmore University",
      unitCode: "BIT 2205",
      unitName: "Database Systems",
      paperType: "cat",
      assessmentDate: null,
      assessmentNumber: null,
      title: "Database Systems CAT"
    });
    expect(body.documentFingerprint).toBeNull();
  }, 15000);

  it("rejects duplicate content against approved papers by fingerprint", async () => {
    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];
    const testDb = createTestD1();
    testDb.seedInstitution({
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
    pdfRenderer.renderPdfPages = async () => [
      {
        pageNumber: 1,
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnWZtQAAAAASUVORK5CYII="
      }
    ];
    const testDb = createTestD1();
    testDb.seedInstitution({
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
    expect(body.message).toBe("Something went wrong on our side. Please try again.");
  }, 15000);
});
