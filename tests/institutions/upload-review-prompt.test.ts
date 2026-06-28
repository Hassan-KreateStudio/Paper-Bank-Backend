import { describe, expect, it } from "bun:test";
import { getInstitutionUploadReviewPrompt } from "../../src/domains/institutions/upload-review-prompt";

describe("institution upload review prompts", () => {
  it("returns the code-owned Strathmore upload review prompt", () => {
    const prompt = getInstitutionUploadReviewPrompt({
      id: "inst_strathmore",
      slug: "strathmore"
    });

    expect(prompt).toBeString();
    expect(prompt).toContain("Target institution: Strathmore University");
  });

  it("returns null for institutions without a code-owned prompt", () => {
    const prompt = getInstitutionUploadReviewPrompt({
      id: "inst_other",
      slug: "other"
    });

    expect(prompt).toBeNull();
  });
});

