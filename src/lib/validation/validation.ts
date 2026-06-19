import { AppError } from "../errors";

export const requireText = (value: string | null | undefined, field: string) => {
  if (!value || value.trim().length === 0) {
    throw new AppError(`${field} is required`, 400);
  }

  return value.trim();
};
