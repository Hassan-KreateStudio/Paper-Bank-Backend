import type { EnvBindings } from "./app-env";

export type HealthStatus = "healthy" | "degraded";

export type HealthCheck = {
  name: string;
  configured: boolean;
  required: boolean;
  status: "up" | "missing";
};

export type HealthReport = {
  service: string;
  status: HealthStatus;
  environment: string;
  timestamp: string;
  checks: HealthCheck[];
};

export const createHealthReport = (env: EnvBindings): HealthReport => {
  const checks: HealthCheck[] = [
    {
      name: "app_env",
      configured: Boolean(env.APP_ENV),
      required: true,
      status: env.APP_ENV ? "up" : "missing"
    },
    {
      name: "upload_review_model",
      configured: Boolean(env.UPLOAD_REVIEW_MODEL),
      required: true,
      status: env.UPLOAD_REVIEW_MODEL ? "up" : "missing"
    },
    {
      name: "embedding_model",
      configured: Boolean(env.EMBEDDING_MODEL),
      required: false,
      status: env.EMBEDDING_MODEL ? "up" : "missing"
    },
    {
      name: "retrieval_model",
      configured: Boolean(env.RETRIEVAL_MODEL),
      required: false,
      status: env.RETRIEVAL_MODEL ? "up" : "missing"
    },
    {
      name: "auth_email_delivery",
      configured: Boolean(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM),
      required: false,
      status: env.RESEND_API_KEY && env.AUTH_EMAIL_FROM ? "up" : "missing"
    },
    {
      name: "staff_auth",
      configured: Boolean(env.STAFF_AUTH_TOKEN_SECRET),
      required: false,
      status: env.STAFF_AUTH_TOKEN_SECRET ? "up" : "missing"
    },
    {
      name: "d1",
      configured: Boolean(env.DB),
      required: false,
      status: env.DB ? "up" : "missing"
    },
    {
      name: "r2",
      configured: Boolean(env.PAPERS_BUCKET),
      required: false,
      status: env.PAPERS_BUCKET ? "up" : "missing"
    },
    {
      name: "vectorize",
      configured: Boolean(env.PAPERS_VECTOR_INDEX),
      required: false,
      status: env.PAPERS_VECTOR_INDEX ? "up" : "missing"
    },
    {
      name: "hyperdrive",
      configured: Boolean(env.HYPERDRIVE),
      required: false,
      status: env.HYPERDRIVE ? "up" : "missing"
    }
  ];

  const status: HealthStatus = checks.every((check) => !check.required || check.configured)
    ? "healthy"
    : "degraded";

  return {
    service: "paper-bank-backend",
    status,
    environment: env.APP_ENV || "unknown",
    timestamp: new Date().toISOString(),
    checks
  };
};
