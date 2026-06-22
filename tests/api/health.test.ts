import { describe, expect, it } from "bun:test";
import app from "../../src";

type PingResponse = {
  ok: boolean;
  message: string;
};

type HealthResponse = {
  service: string;
  status: string;
};

const env = {
  APP_ENV: "test",
  WORKERS_AI_MODEL: "@cf/baai/bge-base-en-v1.5"
};

describe("health routes", () => {
  it("responds to ping", async () => {
    const response = await app.request("/ping", {}, env);
    const body = (await response.json()) as PingResponse;

    expect(response.status).toBe(200);
    expect(body.message).toBe("pong");
  });

  it("sets a request id header on responses", async () => {
    const response = await app.request("/ping", {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeString();
  });

  it("returns an aggregated health report", async () => {
    const response = await app.request("/health", {}, env);
    const body = (await response.json()) as HealthResponse;

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("paper-bank-backend");
  });

  it("returns readiness", async () => {
    const response = await app.request("/health/ready", {}, env);

    expect(response.status).toBe(200);
  });

  it("handles CORS preflight for auth challenge requests", async () => {
    const response = await app.request(
      "/api/auth/challenge",
      {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type,x-institution-id"
        }
      },
      env
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Institution-Id");
  });
});
