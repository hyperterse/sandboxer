export interface RetryOptions {
  maxAttempts: number;
  intervalMs: number;
}

export async function doRetry(
  opts: RetryOptions,
  fn: () => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const max = Math.max(opts.maxAttempts, 1);
  const interval = Math.max(opts.intervalMs, 0) || 200;
  let lastErr: Error | undefined;
  for (let i = 0; i < max; i++) {
    signal?.throwIfAborted();
    try {
      await fn();
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
    if (i < max - 1) {
      await new Promise((r) => setTimeout(r, interval));
    }
  }
  throw lastErr;
}
