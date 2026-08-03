const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry `fn` up to `attempts` times with a short, doubling backoff before
 * giving up. Built for boot-critical one-shot fetches — the scrip master,
 * the open book restored alongside it — that have no poll loop of their own
 * to fall back on: a single transient failure there used to leave the whole
 * board stuck until the operator reloaded the tab by hand. Three tries at
 * 1s/2s/4s clear almost any blip without them ever seeing it.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(baseDelayMs * 2 ** i);
    }
  }
  throw lastErr;
}
