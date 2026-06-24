export type EnvBindings = {
  APP_ENV: string;
  UPLOAD_REVIEW_MODEL: string;
  EMBEDDING_MODEL: string;
  RETRIEVAL_MODEL: string;
  AUTH_TOKEN_SECRET?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  DB?: D1Database;
  PAPERS_BUCKET?: R2Bucket;
  PAPERS_VECTOR_INDEX?: VectorizeIndex;
  AI?: Ai;
  HYPERDRIVE?: Hyperdrive;
};

export type AppVariables = {
  requestId: string;
  institutionId: string | null;
  studentId: string | null;
};

export type AppEnv = {
  Bindings: EnvBindings;
  Variables: AppVariables;
};
