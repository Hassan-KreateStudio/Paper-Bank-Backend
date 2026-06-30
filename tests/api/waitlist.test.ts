import { describe, expect, it } from "bun:test";
import app from "../../src";
import { createAuthToken } from "../../src/domains/auth/token";
import { createTestD1 } from "../support/test-d1";
import { withCapturedResendEmails } from "../support/resend-mock";

const authSecret = "waitlist-auth-secret";
const resendEnv = {
  RESEND_API_KEY: "re_test_key",
  AUTH_EMAIL_FROM: "PaperBank <notify@paperbank.online>"
};

const createEnv = (db: D1Database) => ({
  APP_ENV: "test",
  UPLOAD_REVIEW_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  EMBEDDING_MODEL: "@cf/baai/bge-base-en-v1.5",
  RETRIEVAL_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  AUTH_TOKEN_SECRET: authSecret,
  ...resendEnv,
  DB: db
});

const createAccessToken = async (
  studentId: string,
  institutionId = "inst_strathmore",
  role: "student" | "reviewer" | "admin" = "student"
) => {
  const token = await createAuthToken(studentId, institutionId, role, authSecret);
  return token.token;
};

describe("waitlist route", () => {
  it("adds the authenticated student to the waitlist", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const student = testDb.seedStudent({
      email: "hassan.mutebi@strathmore.edu",
      fullName: "Hassan Mutebi",
      status: "active"
    });
    const accessToken = await createAccessToken(student.id);

    const { result: response, emails } = await withCapturedResendEmails(async () =>
      await app.request(
        "/api/waitlist",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        },
        createEnv(testDb.db)
      )
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe("You have been added to the waitlist.");
    expect(emails).toHaveLength(1);
    expect(emails[0]?.to).toEqual(["hassan.mutebi@strathmore.edu"]);
    expect(emails[0]?.subject).toBe(
      "You joined the PaperBank waitlist for Strathmore University"
    );
    expect(emails[0]?.text).toContain("successfully joined the PaperBank waitlist");
  });

  it("rejects an unauthenticated waitlist join", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();

    const response = await app.request(
      "/api/waitlist",
      {
        method: "POST"
      },
      createEnv(testDb.db)
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toContain("bearer token");
  });

  it("rejects the same authenticated student email twice", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const student = testDb.seedStudent({
      email: "joined.once@strathmore.edu",
      fullName: "Joined Once",
      status: "active"
    });
    const env = createEnv(testDb.db);
    const accessToken = await createAccessToken(student.id);

    await app.request(
      "/api/waitlist",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      },
      env
    );

    const response = await app.request(
      "/api/waitlist",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      },
      env
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toContain("already on the waitlist");
  });
});
