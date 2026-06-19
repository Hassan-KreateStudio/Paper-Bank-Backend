import type { EnvBindings } from "../../lib/app-env";
import { AppError } from "../../lib/errors";

export const getDb = (env: EnvBindings) => env.DB;

export const requireDb = (env: EnvBindings) => {
  const db = getDb(env);

  if (!db) {
    throw new AppError("D1 database binding is not configured.", 500);
  }

  return db;
};
