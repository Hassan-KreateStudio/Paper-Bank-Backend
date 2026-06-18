export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(message, meta ?? {});
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(message, meta ?? {});
  }
};
