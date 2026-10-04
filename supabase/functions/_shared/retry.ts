/**
 * Retry utilities with progressive backoff.
 * Only retries transient errors (network, timeout, 5xx server errors).
 * Permanent authorization/permission errors are NOT retried.
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
};

const PERMANENT_ERROR_PATTERNS = [
  /invalid_grant/i,
  /invalid_token/i,
  /unauthorized/i,
  /forbidden/i,
  /permission_denied/i,
  /permission denied/i,
  /not connected/i,
  /account not found/i,
  /invalid media/i,
  /unsupported (format|media)/i,
  /4001/i, // TikTok permission error
  /40003/i, // TikTok invalid params
  /invalid_request/i,
];

export function isRetryableError(error: Error): boolean {
  const message = error.message;
  for (const pattern of PERMANENT_ERROR_PATTERNS) {
    if (pattern.test(message)) return false;
  }
  return true;
}

export function getBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(delay + jitter, config.maxDelayMs);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: Error, delay: number) => void
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isRetryableError(lastError)) {
        throw lastError;
      }

      if (attempt >= config.maxRetries) {
        throw lastError;
      }

      const delay = getBackoffDelay(attempt, config);
      if (onRetry) {
        onRetry(attempt + 1, lastError, delay);
      }
      await sleep(delay);
    }
  }

  throw lastError!;
}
