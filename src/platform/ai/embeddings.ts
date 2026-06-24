import type { EnvBindings } from "../../lib/app-env";
import { getEmbeddingModel } from "./config";

const EMBEDDING_DIMENSIONS = 64;

const normalizeVector = (vector: number[]) => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
};

const createFallbackEmbedding = (text: string) => {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = text.toLowerCase().match(/[a-z0-9/]+/g) ?? [];

  for (const token of tokens) {
    let tokenHash = 0;

    for (let index = 0; index < token.length; index += 1) {
      tokenHash = (tokenHash * 31 + token.charCodeAt(index)) >>> 0;
    }

    vector[tokenHash % EMBEDDING_DIMENSIONS] += 1;
  }

  return normalizeVector(vector);
};

export const createEmbedding = async (_env: EnvBindings, text: string) => {
  const ai = _env.AI as { run?: (model: string, payload: unknown) => Promise<unknown> } | undefined;
  const embeddingModel = getEmbeddingModel(_env);

  if (ai?.run && embeddingModel) {
    try {
      const result = (await ai.run(embeddingModel, {
        text: [text]
      })) as { data?: number[][] };
      const vector = result.data?.[0];

      if (Array.isArray(vector) && vector.length > 0) {
        return {
          text,
          vector: normalizeVector(vector)
        };
      }
    } catch {
      // Fall back to local deterministic embeddings in non-AI environments.
    }
  }

  return {
    text,
    vector: createFallbackEmbedding(text)
  };
};
