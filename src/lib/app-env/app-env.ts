export type EnvBindings = {
  APP_ENV: string;
  WORKERS_AI_MODEL: string;
  DB?: D1Database;
  PAPERS_BUCKET?: R2Bucket;
  PAPERS_VECTOR_INDEX?: VectorizeIndex;
  AI?: Ai;
  HYPERDRIVE?: Hyperdrive;
};

export type AppVariables = {
  requestId: string;
  institutionId: string | null;
};

export type AppEnv = {
  Bindings: EnvBindings;
  Variables: AppVariables;
};
