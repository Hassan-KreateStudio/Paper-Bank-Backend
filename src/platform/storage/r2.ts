import type { EnvBindings } from "../../lib/app-env";
import { AppError } from "../../lib/errors";

export const getPapersBucket = (env: EnvBindings) => env.PAPERS_BUCKET;

export const requirePapersBucket = (env: EnvBindings) => {
  const bucket = getPapersBucket(env);

  if (!bucket) {
    throw new AppError("R2 bucket binding is not configured.", 500);
  }

  return bucket;
};

export const putPaperFile = async (
  env: EnvBindings,
  key: string,
  body: ArrayBuffer,
  options: {
    httpMetadata?: {
      contentType?: string;
      contentDisposition?: string;
    };
    customMetadata?: Record<string, string>;
  } = {}
) => {
  const bucket = requirePapersBucket(env);
  await bucket.put(key, body, options);
};

export const getPaperFile = async (env: EnvBindings, key: string) => {
  const bucket = requirePapersBucket(env);
  return await bucket.get(key);
};
