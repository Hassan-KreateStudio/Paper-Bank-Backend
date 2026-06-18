import type { EnvBindings } from "../../lib/app-env";

export const createEmbedding = async (_env: EnvBindings, text: string) => {
  return {
    text,
    vector: []
  };
};
