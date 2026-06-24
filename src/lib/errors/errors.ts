const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

const fallbackErrorCodeForStatus = (status: number): string => {
  if (status === 400) return "bad_request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "unprocessable_entity";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "internal_error";

  return "request_error";
};

const normalizeErrorCode = (raw: string, status: number): string => {
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  if (ERROR_CODE_PATTERN.test(normalized)) {
    return normalized;
  }

  return fallbackErrorCodeForStatus(status);
};

export interface AppErrorOptions {
  code?: string;
  clientMessage?: string;
  details?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly clientMessage?: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    public readonly status = 400,
    options: AppErrorOptions = {}
  ) {
    super(message);
    this.code = options.code?.trim() || normalizeErrorCode(message, status);
    this.clientMessage = options.clientMessage;
    this.details = options.details;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401);
  }
}
