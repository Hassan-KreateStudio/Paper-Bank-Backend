import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import app from "../../src";
import { clearCache } from "../../src/platform/cache";
import { createTestD1 } from "../support/test-d1";

type ChallengeResponse = {
  success: boolean;
  challengeId: string;
  expiresAt: string;
};

type VerifyResponse = {
  success: boolean;
  authenticated: boolean;
  studentId: string;
  institutionId: string;
  accessToken: string;
  expiresAt: string;
};

const createEnv = (db: D1Database) => ({
  APP_ENV: "test",
  WORKERS_AI_MODEL: "@cf/baai/bge-base-en-v1.5",
  AUTH_TOKEN_SECRET: "super-secret-auth-token",
  DB: db
});

const withVerificationCodeCapture = async <T>(run: () => Promise<T>) => {
  const originalLog = console.log;
  let verificationCode: string | null = null;

  console.log = (message?: unknown, meta?: unknown) => {
    if (
      message === "Auth verification code generated" &&
      meta &&
      typeof meta === "object" &&
      "verificationCode" in meta &&
      typeof meta.verificationCode === "string"
    ) {
      verificationCode = meta.verificationCode;
    }
  };

  try {
    const result = await run();

    if (!verificationCode) {
      throw new Error("Verification code was not captured during the auth challenge.");
    }

    return {
      result,
      verificationCode
    };
  } finally {
    console.log = originalLog;
  }
};

describe("auth flow", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearCache();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    clearCache();
    globalThis.fetch = originalFetch;
  });

  it("creates a challenge for a first-time student with an allowed institution email", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();

    const response = await app.request(
      "/api/auth/challenge",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          admissionNumber: "SCT221-0002/2022",
          email: "first.timer@strathmore.edu",
          fullName: "First Timer"
        })
      },
      createEnv(testDb.db)
    );
    const body = (await response.json()) as ChallengeResponse;

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.challengeId).toBeString();
    expect(body.expiresAt).toBeString();
  });

  it("rejects a challenge when the email domain is not allowed", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();

    const response = await app.request(
      "/api/auth/challenge",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          admissionNumber: "SCT221-9999/2022",
          email: "ghost.student@gmail.com",
          fullName: "Ghost Student"
        })
      },
      createEnv(testDb.db)
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toContain("domain is not allowed");
  });

  it("sends the verification code by email when resend is configured", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({
        url: typeof url === "string" ? url : url.toString(),
        init
      });

      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }) as typeof fetch;

    const response = await app.request(
      "/api/auth/challenge",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          admissionNumber: "SCT221-0007/2022",
          email: "resend.student@strathmore.edu",
          fullName: "Resend Student"
        })
      },
      {
        ...createEnv(testDb.db),
        RESEND_API_KEY: "re_test_key",
        AUTH_EMAIL_FROM: "PaperBank <verify@paperbank.online>"
      }
    );
    const body = (await response.json()) as ChallengeResponse;
    const emailRequest = fetchCalls[0];
    const emailPayload = JSON.parse(String(emailRequest.init?.body)) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    };

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(emailRequest.url).toBe("https://api.resend.com/emails");
    expect(emailRequest.init?.method).toBe("POST");
    expect(emailRequest.init?.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
      "User-Agent": "paper-bank-backend/0.1"
    });
    expect(emailPayload.from).toBe("PaperBank <verify@paperbank.online>");
    expect(emailPayload.to).toEqual(["resend.student@strathmore.edu"]);
    expect(emailPayload.subject).toBe("Your PaperBank verification code");
    expect(emailPayload.text).toContain("Verification code:");
    expect(emailPayload.html).toContain("PaperBank verification code");
  });

  it("creates the student on first verify, issues a token, and resolves the authenticated student", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const env = createEnv(testDb.db);
    const admissionNumber = "SCT221-0003/2022";
    const email = "auth.student@strathmore.edu";
    const fullName = "Auth Student";

    const challengeCapture = await withVerificationCodeCapture(async () => {
      const challengeResponse = await app.request(
        "/api/auth/challenge",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            admissionNumber,
            email,
            fullName
          })
        },
        env
      );

      return {
        response: challengeResponse,
        body: (await challengeResponse.json()) as ChallengeResponse
      };
    });

    expect(challengeCapture.result.response.status).toBe(200);
    const verifyResponse = await app.request(
      "/api/auth/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          challengeId: challengeCapture.result.body.challengeId,
          verificationCode: challengeCapture.verificationCode
        })
      },
      env
    );
    const verifyBody = (await verifyResponse.json()) as VerifyResponse;
    const storedStudent = testDb.getStudent(verifyBody.studentId);

    const sessionResponse = await app.request(
      "/api/auth/session",
      {
        headers: {
          authorization: `Bearer ${verifyBody.accessToken}`
        }
      },
      env
    );
    const sessionBody = (await sessionResponse.json()) as {
      success: boolean;
      authenticated: boolean;
      student: {
        id: string;
        admissionNumber: string;
        email: string;
        status: string;
      };
    };

    const meResponse = await app.request(
      "/api/students/me",
      {
        headers: {
          authorization: `Bearer ${verifyBody.accessToken}`
        }
      },
      env
    );
    const meBody = (await meResponse.json()) as {
      success?: boolean;
      student: {
        id: string;
        status: string;
      };
    };

    testDb.close();

    expect(verifyResponse.status).toBe(200);
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.authenticated).toBe(true);
    expect(verifyBody.institutionId).toBe("inst_strathmore");
    expect(verifyBody.accessToken).toBeString();

    expect(sessionResponse.status).toBe(200);
    expect(sessionBody.success).toBe(true);
    expect(sessionBody.authenticated).toBe(true);
    expect(sessionBody.student.admissionNumber).toBe(admissionNumber);
    expect(sessionBody.student.email).toBe(email);

    expect(meResponse.status).toBe(200);
    expect(meBody.student.id).toBe(verifyBody.studentId);
    expect(meBody.student.status).toBe("active");

    expect(storedStudent?.status).toBe("active");
    expect(storedStudent?.admissionNumber).toBe(admissionNumber);
    expect(storedStudent?.email).toBe(email);
    expect(storedStudent?.fullName).toBe(fullName);
    expect(storedStudent?.emailVerifiedAt).toBeString();
  });

  it("reuses the same student on later logins with the same admission number and email", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const existingStudent = testDb.seedStudent({
      admissionNumber: "SCT221-0005/2022",
      email: "returning.student@strathmore.edu",
      fullName: "Returning Student"
    });
    const env = createEnv(testDb.db);

    const challengeCapture = await withVerificationCodeCapture(async () => {
      const response = await app.request(
        "/api/auth/challenge",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            admissionNumber: existingStudent.admissionNumber,
            email: existingStudent.email,
            fullName: "Something Else"
          })
        },
        env
      );

      return {
        response,
        body: (await response.json()) as ChallengeResponse
      };
    });

    const verifyResponse = await app.request(
      "/api/auth/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          challengeId: challengeCapture.result.body.challengeId,
          verificationCode: challengeCapture.verificationCode
        })
      },
      env
    );
    const verifyBody = (await verifyResponse.json()) as VerifyResponse;

    testDb.close();

    expect(verifyResponse.status).toBe(200);
    expect(verifyBody.studentId).toBe(existingStudent.id);
  });

  it("rejects an invalid bearer token", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const env = createEnv(testDb.db);

    const response = await app.request(
      "/api/auth/session",
      {
        headers: {
          authorization: "Bearer not-a-real-token"
        }
      },
      env
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toContain("invalid");
  });

  it("rejects an expired challenge", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const env = createEnv(testDb.db);
    const admissionNumber = "SCT221-0004/2022";
    const email = "expired.student@strathmore.edu";
    const fullName = "Expired Student";

    const challengeCapture = await withVerificationCodeCapture(async () => {
      const response = await app.request(
        "/api/auth/challenge",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            admissionNumber,
            email,
            fullName
          })
        },
        env
      );

      return {
        response,
        body: (await response.json()) as ChallengeResponse
      };
    });

    testDb.expireChallenge(challengeCapture.result.body.challengeId);

    const verifyResponse = await app.request(
      "/api/auth/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          challengeId: challengeCapture.result.body.challengeId,
          verificationCode: challengeCapture.verificationCode
        })
      },
      env
    );
    const verifyBody = (await verifyResponse.json()) as { success: boolean; message: string };

    testDb.close();

    expect(verifyResponse.status).toBe(401);
    expect(verifyBody.success).toBe(false);
    expect(verifyBody.message).toContain("expired");
  });

  it("rate limits repeated auth challenge requests from the same ip", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const env = createEnv(testDb.db);

    for (let index = 0; index < 5; index += 1) {
      testDb.seedStudent({
        admissionNumber: `SCT221-010${index}/2022`,
        email: `student${index}@strathmore.edu`,
        fullName: `Student ${index}`
      });

      const response = await app.request(
        "/api/auth/challenge",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.10"
          },
          body: JSON.stringify({
            admissionNumber: `SCT221-010${index}/2022`,
            email: `student${index}@strathmore.edu`,
            fullName: `Student ${index}`
          })
        },
        env
      );

      expect(response.status).toBe(200);
    }

    const limitedResponse = await app.request(
      "/api/auth/challenge",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10"
        },
        body: JSON.stringify({
          admissionNumber: "SCT221-9998/2022",
          email: "student6@strathmore.edu",
          fullName: "Student 6"
        })
      },
      env
    );
    const limitedBody = (await limitedResponse.json()) as { success: boolean; message: string };

    testDb.close();

    expect(limitedResponse.status).toBe(429);
    expect(limitedBody.success).toBe(false);
    expect(limitedBody.message).toContain("Too many requests");
  });
});
