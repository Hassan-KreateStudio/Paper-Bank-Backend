import { describe, expect, it } from "bun:test";
import { createAuthToken, verifyAuthToken } from "../../src/domains/auth/token";

const secret = "super-secret-auth-token-value";

describe("auth tokens", () => {
  it("creates and verifies a signed auth token", async () => {
    const token = await createAuthToken("student_123", "inst_strathmore", secret);
    const payload = await verifyAuthToken(token.token, secret);

    expect(payload.sub).toBe("student_123");
    expect(payload.institutionId).toBe("inst_strathmore");
  });

  it("rejects a tampered auth token", async () => {
    const token = await createAuthToken("student_123", "inst_strathmore", secret);
    const [payload] = token.token.split(".");

    await expect(verifyAuthToken(`${payload}.tampered`, secret)).rejects.toThrow(
      "The auth token is invalid."
    );
  });
});
