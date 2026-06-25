import { describe, expect, it } from "bun:test";
import app from "../../src";
import { createAuthToken } from "../../src/domains/auth/token";
import { createStaffAuthToken } from "../../src/domains/staff-auth/token";
import { createPdfFixture } from "../support/pdf-fixture";
import { createMockR2Bucket } from "../support/mock-r2";
import { createTestD1 } from "../support/test-d1";

const authSecret = "super-secret-auth-token";
const staffAuthSecret = "super-secret-staff-auth-token";
const resendEnv = {
  RESEND_API_KEY: "re_test_key",
  AUTH_EMAIL_FROM: "PaperBank <staff@paperbank.online>"
};

const extractInviteEmailDetails = (text: string) => {
  const username = text.match(/Username:\s*(.+)/i)?.[1]?.trim() ?? null;
  const inviteId = text.match(/Invite ID:\s*([a-f0-9-]+)/i)?.[1]?.trim() ?? null;
  const inviteToken = text.match(/Activation code:\s*([a-f0-9]+)/i)?.[1]?.trim() ?? null;

  if (!username || !inviteId || !inviteToken) {
    throw new Error("The staff invite email did not include the expected activation details.");
  }

  return {
    username,
    inviteId,
    inviteToken
  };
};

const createStudentAccessToken = async (
  studentId: string,
  institutionId = "inst_strathmore",
  role: "student" | "reviewer" | "admin" = "student"
) => {
  const token = await createAuthToken(studentId, institutionId, role, authSecret);
  return token.token;
};

const createStaffAccessToken = async (
  staffUserId: string,
  institutionId: string | null,
  role: "reviewer" | "admin"
) => {
  const token = await createStaffAuthToken(staffUserId, institutionId, role, staffAuthSecret);
  return token.token;
};

const createEnv = (db: D1Database, bucket: R2Bucket) => ({
  APP_ENV: "test",
  UPLOAD_REVIEW_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  EMBEDDING_MODEL: "@cf/baai/bge-base-en-v1.5",
  RETRIEVAL_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  AUTH_TOKEN_SECRET: authSecret,
  STAFF_AUTH_TOKEN_SECRET: staffAuthSecret,
  ...resendEnv,
  DB: db,
  PAPERS_BUCKET: bucket
});

const createStoredPdfFile = async () =>
  await createPdfFixture({
    name: "admin-review.pdf",
    pageColor: "white",
    textBlocks: [
      { text: "Strathmore University", x: 297, y: 760, align: "center", fontSize: 15 },
      { text: "Unit Code: BBT 4106", x: 297, y: 690, align: "center", fontSize: 14 },
      { text: "Unit Name: Business Intelligence I", x: 297, y: 660, align: "center", fontSize: 14 },
      { text: "Continuous Assessment Test (CAT) 1", x: 297, y: 630, align: "center", fontSize: 14 }
    ]
  });

describe("admin routes", () => {
  it("blocks a non-admin from the admin control surface", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    const student = testDb.seedStudent({
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });
    const accessToken = await createStudentAccessToken(student.id);

    const response = await app.request(
      "/api/admin/institutions",
      {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      },
      env
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.message).toBe("The staff auth token is invalid.");
  });

  it("lets an admin operate the cross-institution control surface", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    testDb.seedInstitution({
      id: "inst_other",
      name: "KCA University",
      slug: "kca",
      shortCode: "KCA",
      emailDomain: "kca.ac.ke"
    });

    const admin = await testDb.seedStaffUser({
      institutionId: null,
      email: "admin@paperbank.online",
      username: "global-admin",
      role: "admin",
      status: "active"
    });
    const otherStudent = testDb.seedStudent({
      institutionId: "inst_other",
      admissionNumber: "KCA221-0001/2022",
      email: "review.target@kca.ac.ke",
      fullName: "Review Target",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });

    testDb.seedPaper({
      institutionId: "inst_other",
      title: "KCA Database Exam",
      unitCode: "CSC 2101",
      unitName: "Database Systems"
    });
    testDb.seedWaitlistEntry({
      institutionId: "inst_other",
      name: "KCA Waitlist",
      email: "waitlist@kca.ac.ke"
    });

    const submission = testDb.seedUploadSubmission({
      institutionId: "inst_other",
      studentId: otherStudent.id,
      title: "Business Intelligence CAT",
      unitCode: "BBT 4106",
      unitName: "Business Intelligence I",
      paperType: "cat",
      fileKey: "uploads/admin-review.pdf",
      fileHash: "admin-review-file-hash",
      documentFingerprint: "inst_other|bbt4106|cat|2026-05-18|1"
    });

    const storedPdf = await createStoredPdfFile();
    const storedPdfBytes = await storedPdf.arrayBuffer();
    await (bucket as unknown as ReturnType<typeof createMockR2Bucket>).put(
      submission.fileKey,
      storedPdfBytes,
      {
        httpMetadata: {
          contentType: "application/pdf"
        }
      }
    );

    const adminAccessToken = await createStaffAccessToken(admin.id, null, "admin");

    const institutionsResponse = await app.request(
      "/api/admin/institutions",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const institutionsBody = (await institutionsResponse.json()) as {
      items: Array<{ id: string; name: string }>;
    };

    expect(institutionsResponse.status).toBe(200);
    expect(institutionsBody.items).toHaveLength(2);
    expect(institutionsBody.items.some((item) => item.name === "Strathmore University")).toBe(true);
    expect(institutionsBody.items.some((item) => item.name === "KCA University")).toBe(true);

    const usersResponse = await app.request(
      "/api/admin/users",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const usersBody = (await usersResponse.json()) as {
      items: Array<{ id: string; institutionName: string; role: string }>;
    };

    expect(usersResponse.status).toBe(200);
    expect(usersBody.items.some((item) => item.id === otherStudent.id)).toBe(true);
    expect(usersBody.items.some((item) => item.institutionName === "KCA University")).toBe(true);

    const roleResponse = await app.request(
      `/api/admin/users/${otherStudent.id}/role`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          role: "reviewer"
        })
      },
      env
    );
    const roleBody = (await roleResponse.json()) as {
      success: boolean;
      message: string;
    };

    expect(roleResponse.status).toBe(501);
    expect(roleBody.success).toBe(false);
    expect(roleBody.message).toBe("Admin staff promotion is not implemented yet.");

    const reviewQueueResponse = await app.request(
      "/api/admin/review/queue",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const reviewQueueBody = (await reviewQueueResponse.json()) as {
      items: Array<{ id: string; institutionName: string }>;
    };

    expect(reviewQueueResponse.status).toBe(200);
    expect(reviewQueueBody.items.some((item) => item.id === submission.id)).toBe(true);
    expect(reviewQueueBody.items.some((item) => item.institutionName === "KCA University")).toBe(true);

    const approveResponse = await app.request(
      `/api/admin/review/submissions/${submission.id}/approve`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Approved by global admin"
        })
      },
      env
    );
    const approveBody = (await approveResponse.json()) as {
      success: boolean;
      submission: { status: string };
      paper: { institutionId: string; sourceUploadSubmissionId: string | null };
    };

    expect(approveResponse.status).toBe(200);
    expect(approveBody.success).toBe(true);
    expect(approveBody.submission.status).toBe("approved");
    expect(approveBody.paper.institutionId).toBe("inst_other");
    expect(approveBody.paper.sourceUploadSubmissionId).toBe(submission.id);

    const papersResponse = await app.request(
      "/api/admin/papers",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const papersBody = (await papersResponse.json()) as {
      items: Array<{ institutionName: string }>;
    };

    expect(papersResponse.status).toBe(200);
    expect(papersBody.items.some((item) => item.institutionName === "KCA University")).toBe(true);

    const waitlistResponse = await app.request(
      "/api/admin/waitlist",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const waitlistBody = (await waitlistResponse.json()) as {
      items: Array<{ email: string; institutionName: string }>;
    };

    expect(waitlistResponse.status).toBe(200);
    expect(waitlistBody.items).toHaveLength(1);
    expect(waitlistBody.items[0]?.email).toBe("waitlist@kca.ac.ke");
    expect(waitlistBody.items[0]?.institutionName).toBe("KCA University");

    const analyticsResponse = await app.request(
      "/api/admin/analytics/overview",
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const analyticsBody = (await analyticsResponse.json()) as {
      overview: {
        institutions: number;
        students: number;
        reviewers: number;
        admins: number;
        approvedPapers: number;
        waitlistEntries: number;
      };
    };

    testDb.close();

    expect(analyticsResponse.status).toBe(200);
    expect(analyticsBody.overview.institutions).toBe(2);
    expect(analyticsBody.overview.students).toBe(1);
    expect(analyticsBody.overview.reviewers).toBe(0);
    expect(analyticsBody.overview.admins).toBe(1);
    expect(analyticsBody.overview.approvedPapers).toBe(2);
    expect(analyticsBody.overview.waitlistEntries).toBe(1);
  }, 20000);

  it("lets an admin invite a reviewer by email and the reviewer can activate the invite", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);
    testDb.seedInstitution();

    const admin = await testDb.seedStaffUser({
      institutionId: null,
      email: "admin@paperbank.online",
      username: "global-admin",
      role: "admin",
      status: "active"
    });
    const adminAccessToken = await createStaffAccessToken(admin.id, null, "admin");

    const originalFetch = globalThis.fetch;
    let emailText: string | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://api.resend.com/emails" && init?.body) {
        const payload = JSON.parse(String(init.body)) as { text?: string };
        emailText = payload.text ?? null;

        return new Response(JSON.stringify({ id: "email_123" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      return originalFetch(url as RequestInfo | URL, init);
    }) as typeof fetch;

    try {
      const inviteResponse = await app.request(
        "/api/admin/invitations",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${adminAccessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            institutionId: "inst_strathmore",
            email: "new.reviewer@paperbank.online"
          })
        },
        env
      );
      const inviteBody = (await inviteResponse.json()) as {
        success: boolean;
        invitation: {
          id: string;
          institutionId: string;
          email: string;
          username: string;
          role: string;
          expiresAt: string;
        };
      };

      expect(inviteResponse.status).toBe(200);
      expect(inviteBody.success).toBe(true);
      expect(inviteBody.invitation.email).toBe("new.reviewer@paperbank.online");
      expect(inviteBody.invitation.role).toBe("reviewer");

      if (!emailText) {
        throw new Error("The reviewer invite email was not captured.");
      }

      const inviteDetails = extractInviteEmailDetails(emailText);
      const storedInvite = testDb.getStaffInvite(inviteBody.invitation.id);
      const pendingStaffUser = testDb.getStaffUserByEmail("new.reviewer@paperbank.online");

      expect(inviteDetails.username).toBe(inviteBody.invitation.username);
      expect(inviteDetails.inviteId).toBe(inviteBody.invitation.id);
      expect(storedInvite?.consumedAt).toBeNull();
      expect(storedInvite?.email).toBe("new.reviewer@paperbank.online");

      expect(pendingStaffUser?.status).toBe("inactive");
      expect(pendingStaffUser?.username).toBe(inviteBody.invitation.username);

      const activateResponse = await app.request(
        "/api/staff-auth/activate",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            inviteId: inviteDetails.inviteId,
            inviteToken: inviteDetails.inviteToken,
            password: "reviewer-password-123"
          })
        },
        env
      );
      const activateBody = (await activateResponse.json()) as {
        success: boolean;
        accessToken: string;
        staffUser: { username: string; email: string; role: string; status: string };
      };

      expect(activateResponse.status).toBe(200);
      expect(activateBody.success).toBe(true);
      expect(activateBody.staffUser.username).toBe(inviteBody.invitation.username);
      expect(activateBody.staffUser.email).toBe("new.reviewer@paperbank.online");
      expect(activateBody.staffUser.role).toBe("reviewer");
      expect(activateBody.staffUser.status).toBe("active");
      expect(activateBody.accessToken.length).toBeGreaterThan(20);

      const loginResponse = await app.request(
        "/api/staff-auth/login",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            username: inviteBody.invitation.username,
            password: "reviewer-password-123"
          })
        },
        env
      );
      const loginBody = (await loginResponse.json()) as {
        success: boolean;
        staffUser: { username: string; status: string };
      };

      expect(loginResponse.status).toBe(200);
      expect(loginBody.success).toBe(true);
      expect(loginBody.staffUser.username).toBe(inviteBody.invitation.username);
      expect(loginBody.staffUser.status).toBe("active");

      const activatedInvite = testDb.getStaffInvite(inviteBody.invitation.id);

      expect(activatedInvite?.consumedAt).toBeString();
    } finally {
      globalThis.fetch = originalFetch;
      testDb.close();
    }
  }, 20000);

  it("lets an admin inspect review assets and exposes explicit placeholders for unfinished controls", async () => {
    const testDb = createTestD1();
    const bucket = createMockR2Bucket() as unknown as R2Bucket;
    const env = createEnv(testDb.db, bucket);

    testDb.seedInstitution();
    testDb.seedInstitution({
      id: "inst_other",
      name: "KCA University",
      slug: "kca",
      shortCode: "KCA",
      emailDomain: "kca.ac.ke"
    });

    const admin = await testDb.seedStaffUser({
      institutionId: null,
      email: "admin@paperbank.online",
      username: "global-admin",
      role: "admin",
      status: "active"
    });
    const otherStudent = testDb.seedStudent({
      institutionId: "inst_other",
      admissionNumber: "KCA221-0001/2022",
      email: "review.target@kca.ac.ke",
      fullName: "Review Target",
      status: "active",
      emailVerifiedAt: new Date().toISOString()
    });

    const queuedSubmission = testDb.seedUploadSubmission({
      institutionId: "inst_other",
      studentId: otherStudent.id,
      fileKey: "uploads/admin-inspection.pdf",
      fileName: "admin-inspection.pdf"
    });
    const approvedSubmission = testDb.seedUploadSubmission({
      id: "sub-approved-paper",
      institutionId: "inst_other",
      studentId: otherStudent.id,
      status: "approved"
    });
    const paper = testDb.seedPaper({
      institutionId: "inst_other",
      sourceUploadSubmissionId: approvedSubmission.id,
      fileKey: "papers/admin-paper.pdf",
      title: "KCA Database Exam"
    });

    const storedPdf = await createStoredPdfFile();
    const storedPdfBytes = await storedPdf.arrayBuffer();
    await (bucket as unknown as ReturnType<typeof createMockR2Bucket>).put(
      queuedSubmission.fileKey,
      storedPdfBytes,
      {
        httpMetadata: {
          contentType: "application/pdf"
        }
      }
    );
    await (bucket as unknown as ReturnType<typeof createMockR2Bucket>).put(paper.fileKey, storedPdfBytes, {
      httpMetadata: {
        contentType: "application/pdf"
      }
    });

    const adminAccessToken = await createStaffAccessToken(admin.id, null, "admin");

    const detailResponse = await app.request(
      `/api/admin/review/submissions/${queuedSubmission.id}`,
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const detailBody = (await detailResponse.json()) as {
      success: boolean;
      submission: { id: string };
    };

    expect(detailResponse.status).toBe(200);
    expect(detailBody.submission.id).toBe(queuedSubmission.id);

    const fileResponse = await app.request(
      `/api/admin/review/submissions/${queuedSubmission.id}/file`,
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );

    expect(fileResponse.status).toBe(200);
    expect(await fileResponse.arrayBuffer()).toEqual(storedPdfBytes);

    const holdResponse = await app.request(
      `/api/admin/review/submissions/${queuedSubmission.id}/hold`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Admin hold"
        })
      },
      env
    );
    const holdBody = (await holdResponse.json()) as {
      success: boolean;
      submission: { status: string };
    };

    expect(holdResponse.status).toBe(200);
    expect(holdBody.submission.status).toBe("in_review");

    const rejectResponse = await app.request(
      `/api/admin/review/submissions/${queuedSubmission.id}/reject`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Admin reject"
        })
      },
      env
    );
    const rejectBody = (await rejectResponse.json()) as {
      success: boolean;
      submission: { status: string };
    };

    expect(rejectResponse.status).toBe(200);
    expect(rejectBody.submission.status).toBe("rejected");

    const paperResponse = await app.request(
      `/api/admin/papers/${paper.id}`,
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );
    const paperBody = (await paperResponse.json()) as {
      success: boolean;
      paper: { id: string };
    };

    expect(paperResponse.status).toBe(200);
    expect(paperBody.paper.id).toBe(paper.id);

    const paperFileResponse = await app.request(
      `/api/admin/papers/${paper.id}/file`,
      {
        headers: {
          authorization: `Bearer ${adminAccessToken}`
        }
      },
      env
    );

    expect(paperFileResponse.status).toBe(200);
    expect(await paperFileResponse.arrayBuffer()).toEqual(storedPdfBytes);

    const archiveResponse = await app.request(
      `/api/admin/papers/${paper.id}/archive`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          notes: "Admin archive"
        })
      },
      env
    );
    const archiveBody = (await archiveResponse.json()) as {
      success: boolean;
      paper: { status: string };
    };

    expect(archiveResponse.status).toBe(200);
    expect(archiveBody.paper.status).toBe("archived");

    testDb.close();

  }, 20000);
});
