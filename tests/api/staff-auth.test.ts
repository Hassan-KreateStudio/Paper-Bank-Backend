import { describe, expect, it } from "bun:test";
import app from "../../src";
import { createAuthToken } from "../../src/domains/auth/token";
import { createTestD1 } from "../support/test-d1";

const authSecret = "super-secret-auth-token";
const staffAuthSecret = "super-secret-staff-auth-token";

const createEnv = (db: D1Database) => ({
  APP_ENV: "test",
  UPLOAD_REVIEW_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  EMBEDDING_MODEL: "@cf/baai/bge-base-en-v1.5",
  RETRIEVAL_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  AUTH_TOKEN_SECRET: authSecret,
  STAFF_AUTH_TOKEN_SECRET: staffAuthSecret,
  DB: db
});

describe("staff auth routes", () => {
  it("logs in a staff user and resolves the staff session", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    await testDb.seedStaffUser({
      institutionId: "inst_strathmore",
      email: "reviewer@paperbank.online",
      username: "reviewer-one",
      password: "staff-password-123",
      role: "reviewer",
      status: "active"
    });

    const env = createEnv(testDb.db);

    const loginResponse = await app.request(
      "/api/staff-auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          username: "reviewer-one",
          password: "staff-password-123"
        })
      },
      env
    );
    const loginBody = (await loginResponse.json()) as {
      success: boolean;
      accessToken: string;
      staffUser: { username: string; role: string; institutionId: string | null };
    };

    expect(loginResponse.status).toBe(200);
    expect(loginBody.success).toBe(true);
    expect(loginBody.staffUser.username).toBe("reviewer-one");
    expect(loginBody.staffUser.role).toBe("reviewer");
    expect(loginBody.accessToken.length).toBeGreaterThan(20);

    const sessionResponse = await app.request(
      "/api/staff-auth/session",
      {
        headers: {
          authorization: `Bearer ${loginBody.accessToken}`
        }
      },
      env
    );
    const sessionBody = (await sessionResponse.json()) as {
      success: boolean;
      authenticated: boolean;
      staffUser: { username: string; role: string };
    };

    testDb.close();

    expect(sessionResponse.status).toBe(200);
    expect(sessionBody.success).toBe(true);
    expect(sessionBody.authenticated).toBe(true);
    expect(sessionBody.staffUser.username).toBe("reviewer-one");
    expect(sessionBody.staffUser.role).toBe("reviewer");
  });

  it("does not let a student token reach staff-only review routes", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const student = testDb.seedStudent({
      email: "student@strathmore.edu",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });

    const token = await createAuthToken(student.id, "inst_strathmore", "student", authSecret);
    const env = createEnv(testDb.db);

    const response = await app.request(
      "/api/review/queue",
      {
        headers: {
          authorization: `Bearer ${token.token}`
        }
      },
      env
    );
    const body = (await response.json()) as {
      success: boolean;
      message: string;
    };

    testDb.close();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toBe("The staff auth token is invalid.");
  });
});
