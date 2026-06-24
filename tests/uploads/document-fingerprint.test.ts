import { describe, expect, it } from "bun:test";
import {
  buildDocumentFingerprint,
  normalizeAssessmentDate,
  normalizeAssessmentNumber,
  normalizeAssessmentType,
  normalizeDocumentFingerprint,
  normalizeUnitCode
} from "../../src/domains/uploads/services/document-fingerprint";

describe("document fingerprint normalization", () => {
  it("normalizes unit codes into lowercase alphanumeric tokens", () => {
    expect(normalizeUnitCode("BBT 4106")).toBe("bbt4106");
    expect(normalizeUnitCode("BIT-2205")).toBe("bit2205");
    expect(normalizeUnitCode("  ")).toBeNull();
  });

  it("normalizes cat variants into cat", () => {
    expect(normalizeAssessmentType("CAT")).toBe("cat");
    expect(normalizeAssessmentType("C.A.T")).toBe("cat");
    expect(normalizeAssessmentType("Continuous Assessment Test")).toBe("cat");
    expect(normalizeAssessmentType("Class Assessment Test")).toBe("cat");
    expect(normalizeAssessmentType("Class Assessment")).toBe("cat");
  });

  it("normalizes exam and assignment variants", () => {
    expect(normalizeAssessmentType("Exam")).toBe("exam");
    expect(normalizeAssessmentType("End Semester Exam")).toBe("exam");
    expect(normalizeAssessmentType("Main Examination")).toBe("exam");
    expect(normalizeAssessmentType("Coursework Assignment")).toBe("assignment");
    expect(normalizeAssessmentType("Research Paper")).toBe("unknown");
  });

  it("normalizes assessment dates into iso format", () => {
    expect(normalizeAssessmentDate("2026-05-18")).toBe("2026-05-18");
    expect(normalizeAssessmentDate("2026/5/18")).toBe("2026-05-18");
    expect(normalizeAssessmentDate("18th May 2026")).toBe("2026-05-18");
    expect(normalizeAssessmentDate("May 18, 2026")).toBe("2026-05-18");
    expect(normalizeAssessmentDate("soon")).toBeNull();
  });

  it("extracts the assessment number from the paper label or title", () => {
    expect(normalizeAssessmentNumber("CAT 1")).toBe("1");
    expect(normalizeAssessmentNumber("Continuous Assessment Test (CAT) 2")).toBe("2");
    expect(normalizeAssessmentNumber(null, "Database Systems Exam 3")).toBe("3");
    expect(normalizeAssessmentNumber("Final Exam", "Database Systems")).toBeNull();
  });

  it("builds a fingerprint only for cat and exam documents", () => {
    expect(
      buildDocumentFingerprint({
        institutionId: "inst_strathmore",
        unitCode: "bbt4106",
        assessmentType: "cat",
        assessmentDate: "2026-05-18",
        assessmentNumber: "1"
      })
    ).toBe("inst_strathmore|bbt4106|cat|2026-05-18|1");

    expect(
      buildDocumentFingerprint({
        institutionId: "inst_strathmore",
        unitCode: "bbt4106",
        assessmentType: "exam",
        assessmentDate: "2026-05-18",
        assessmentNumber: null
      })
    ).toBe("inst_strathmore|bbt4106|exam|2026-05-18|unknown");

    expect(
      buildDocumentFingerprint({
        institutionId: "inst_strathmore",
        unitCode: "bbt4106",
        assessmentType: "assignment",
        assessmentDate: "2026-05-18",
        assessmentNumber: "1"
      })
    ).toBeNull();
  });

  it("returns the full normalized identity in one pass", () => {
    expect(
      normalizeDocumentFingerprint({
        institutionId: "inst_strathmore",
        unitCode: "BBT 4106",
        paperType: "Continuous Assessment Test (CAT) 1",
        date: "18th May 2026",
        title: "Business Intelligence CAT 1"
      })
    ).toEqual({
      unitCode: "bbt4106",
      assessmentType: "cat",
      assessmentDate: "2026-05-18",
      assessmentNumber: "1",
      documentFingerprint: "inst_strathmore|bbt4106|cat|2026-05-18|1"
    });
  });
});
