import { describe, expect, it } from "bun:test";
import { institutionsRepository } from "../../src/domains/institutions/repository";
import { createTestD1 } from "../support/test-d1";

describe("institutions repository", () => {
  it("returns the upload review prompt for an institution", async () => {
    const testDb = createTestD1();
    const seededInstitution = testDb.seedInstitution({
      uploadReviewPrompt: "Review this document using Strathmore upload standards."
    });

    const institution = await institutionsRepository.findById(testDb.db, seededInstitution.id);

    testDb.close();

    expect(institution).not.toBeNull();
    expect(institution?.uploadReviewPrompt).toBe(
      "Review this document using Strathmore upload standards."
    );
  });
});
