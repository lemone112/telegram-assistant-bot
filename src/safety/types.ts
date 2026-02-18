export type ErrorCategory = 'USER_INPUT' | 'CONFIG' | 'UPSTREAM' | 'DB' | 'UNKNOWN';

export type NormalizedError = {
  category: ErrorCategory;
  code: string;
  message: string; // user-facing
  details?: string; // internal (logs)
  retryable?: boolean;
};

export type IdempotencyStatus = 'in_progress' | 'succeeded' | 'failed';

export type IdempotencyRecord = {
  key: string;
  status: IdempotencyStatus;
  result_payload?: unknown;
  external_ids?: Record<string, string | string[]>;
  error?: { code: string; message: string; details?: string };
  started_at?: string;
  finished_at?: string;
};
