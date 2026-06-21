import { describe, expect, it } from "bun:test";
import app from "../../src";
import { createAuthToken } from "../../src/domains/auth/token";
import { createPdfFixture } from "../support/pdf-fixture";
import { createTestD1 } from "../support/test-d1";

type UploadPrefillResponse = {
  success: boolean;
  file: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    hash: string;
  };
  extracted: {
    textPreview: string;
    metadata: {
      institutionName: string | null;
      unitCode: string | null;
      unitName: string | null;
      paperType: string | null;
      academicYear: string | null;
    };
    confidence: {
      institutionName: "high" | "medium" | "low";
      unitCode: "high" | "medium" | "low";
      unitName: "high" | "medium" | "low";
      paperType: "high" | "medium" | "low";
      academicYear: "high" | "medium" | "low";
    };
  };
  review: {
    documentKind: "strathmore_cat_or_exam" | "not_strathmore_cat_or_exam";
    visual: {
      pageRenderStatus: "rendered" | "failed";
      paperTone: "white" | "non_white" | "unknown";
      whitePixelRatio: number | null;
    };
    rules: string[];
    checks: Array<{
      code: string;
      status: "pass" | "warn";
      message: string;
    }>;
  };
  duplicateCheck: {
    isDuplicate: boolean;
    reason: "none" | "file_hash" | "metadata";
    matchedPaperId: string | null;
    matchedSubmissionId: string | null;
  };
};

const authSecret = "super-secret-auth-token";

const createEnv = (db: D1Database) => ({
  APP_ENV: "test",
  WORKERS_AI_MODEL: "@cf/baai/bge-base-en-v1.5",
  AUTH_TOKEN_SECRET: authSecret,
  DB: db
});

const createAccessToken = async (studentId: string, institutionId = "inst_strathmore") => {
  const token = await createAuthToken(studentId, institutionId, authSecret);
  return token.token;
};

const createExamPdfFile = async (
  name = "database-systems.pdf",
  pageColor: "white" | "yellow" = "yellow"
) =>
  await createPdfFixture({
    name,
    pageColor,
    lines: [
      "Strathmore University",
      "Unit Code: BIT 2205",
      "Unit Name: Database Systems",
      "Paper Type: End Semester Exam",
      "Academic Year: 2023/2024",
      "Date: 11th May 2026",
      "Time: 1 Hour"
    ]
  });

const createAssignmentPdfFile = async (name = "assignment.pdf") =>
  await createPdfFixture({
    name,
    pageColor: "yellow",
    lines: [
      "Strathmore University",
      "Unit Code: BIT 2205",
      "Unit Name: Database Systems",
      "Paper Type: Assignment",
      "Academic Year: 2023/2024"
    ]
  });

describe("upload prefill route", () => {
  it("extracts Strathmore metadata from a non-white uploaded pdf", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
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
      createEnv(testDb.db)
    );
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.file.name).toBe("database-systems.pdf");
    expect(body.file.mimeType).toBe("application/pdf");
    expect(body.file.hash).toBeString();
    expect(body.review.visual.pageRenderStatus).toBe("rendered");
    expect(body.review.visual.paperTone).toBe("non_white");
    expect(body.extracted.metadata.institutionName).toBe("Strathmore University");
    expect(body.extracted.metadata.unitCode).toBe("BIT 2205");
    expect(body.extracted.metadata.unitName).toBe("Database Systems");
    expect(body.extracted.metadata.paperType).toBe("exam");
    expect(body.extracted.metadata.academicYear).toBe("2023/2024");
    expect(body.review.documentKind).toBe("strathmore_cat_or_exam");
    expect(body.review.rules).toEqual([
      "Document text should mention Strathmore University.",
      "Document should clearly be a CAT or exam.",
      "Unit code should be present as a labeled value or match an uppercase code plus four digits.",
      "Unit name should be present as a labeled value.",
      "Document should include a date.",
      "Document should include a time or duration.",
      "CAT and exam papers should be printed on non-white paper."
    ]);
    expect(body.review.checks).toContainEqual({
      code: "paper_color_non_white",
      status: "pass",
      message: "Rendered first page appears to be on non-white paper."
    });
    expect(body.review.checks).toContainEqual({
      code: "assessment_kind_match",
      status: "pass",
      message: "Document matches the Strathmore CAT or exam pattern."
    });
    expect(body.duplicateCheck.isDuplicate).toBe(false);
    expect(body.duplicateCheck.reason).toBe("none");
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

  it("flags an exact duplicate by file hash", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
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
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.duplicateCheck.isDuplicate).toBe(true);
    expect(body.duplicateCheck.reason).toBe("file_hash");
    expect(body.duplicateCheck.matchedPaperId).toBe(seededPaper.id);
    expect(body.duplicateCheck.matchedSubmissionId).toBeNull();
  }, 15000);

  it("classifies non exam uploads as not a Strathmore CAT or exam", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", await createAssignmentPdfFile());

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
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.extracted.metadata.paperType).toBe("assignment");
    expect(body.review.documentKind).toBe("not_strathmore_cat_or_exam");
    expect(body.review.checks).toContainEqual({
      code: "assessment_kind_match",
      status: "warn",
      message: "Document is not clearly a Strathmore CAT or exam."
    });
  }, 15000);

  it("stops early when the rendered page appears white", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createAccessToken(student.id);
    const formData = new FormData();

    formData.set("file", await createExamPdfFile("white-paper-exam.pdf", "white"));

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
    const body = (await response.json()) as UploadPrefillResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.review.visual.paperTone).toBe("white");
    expect(body.extracted.textPreview).toBe("");
    expect(body.review.documentKind).toBe("not_strathmore_cat_or_exam");
    expect(body.review.checks).toContainEqual({
      code: "paper_color_non_white",
      status: "warn",
      message: "Rendered first page appears to be on white paper."
    });
  }, 15000);

  it("rejects uploads when the institution has no review profile", async () => {
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

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toContain("No upload review profile is configured");
  }, 15000);
});
