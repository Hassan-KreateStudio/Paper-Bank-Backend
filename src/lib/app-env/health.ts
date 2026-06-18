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
      name: "workers_ai_model",
      configured: Boolean(env.WORKERS_AI_MODEL),
      required: false,
      status: env.WORKERS_AI_MODEL ? "up" : "missing"
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
