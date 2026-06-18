export const withTransaction = async <T>(callback: () => Promise<T>) => {
  return callback();
};
