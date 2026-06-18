import type { EnvBindings } from "../../lib/app-env";

export const getHyperdriveBinding = (env: EnvBindings) => {
  return env.HYPERDRIVE ?? null;
};
