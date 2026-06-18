import type { EnvBindings } from "../../lib/app-env";

export const getDb = (env: EnvBindings) => env.DB;
