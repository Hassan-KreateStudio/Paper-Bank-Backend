import { describe, expect, it } from "bun:test";
import app from "../../src";
import { createTestD1 } from "../support/test-d1";

const createEnv = (db: D1Database) => ({
  APP_ENV: "test",
  WORKERS_AI_MODEL: "@cf/baai/bge-base-en-v1.5",
  DB: db
});

describe("waitlist route", () => {
  it("adds a strathmore email to the strathmore waitlist", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();

    const response = await app.request(
      "/api/waitlist",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          institutionSlug: "strathmore",
          name: "Hassan Mutebi",
          email: "Hassan.Mutebi@strathmore.edu"
        })
      },
      createEnv(testDb.db)
    );
    const body = (await response.json()) as { success: boolean; message: string };

    testDb.close();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe("You have been added to the waitlist.");
  });

  it("rejects a non-strathmore email for the strathmore waitlist", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();

    const response = await app.request(
      "/api/waitlist",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          institutionSlug: "strathmore",
          name: "Wrong Domain",
          email: "wrong.domain@gmail.com"
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

  it("rejects the same waitlist email twice", async () => {
    const testDb = createTestD1();
    testDb.seedInstitution();
    const env = createEnv(testDb.db);

    await app.request(
      "/api/waitlist",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          institutionSlug: "strathmore",
          name: "First Join",
          email: "joined.once@strathmore.edu"
        })
      },
      env
    );

    const response = await app.request(
      "/api/waitlist",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          institutionSlug: "strathmore",
          name: "Second Join",
          email: "joined.once@strathmore.edu"
        })
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
