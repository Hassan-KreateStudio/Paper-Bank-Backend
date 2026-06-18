export const requireText = (value: string | null | undefined, field: string) => {
  if (!value || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
};
