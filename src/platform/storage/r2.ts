import type { EnvBindings } from "../../lib/app-env";

export const getPapersBucket = (env: EnvBindings) => env.PAPERS_BUCKET;
