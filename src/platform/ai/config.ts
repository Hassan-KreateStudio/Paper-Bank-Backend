import type { EnvBindings } from "../../lib/app-env";

export const getUploadReviewModel = (env: EnvBindings) => env.UPLOAD_REVIEW_MODEL;

export const getEmbeddingModel = (env: EnvBindings) => env.EMBEDDING_MODEL;

export const getRetrievalModel = (env: EnvBindings) => env.RETRIEVAL_MODEL;
