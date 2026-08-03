/**
 * Sliding-window rate limiter for Angel One's per-endpoint throttling.
 *
 * The broker meters each endpoint against the API key, not against whichever
 * browser tab or operator happened to call it — every request this
 * deployment makes to a given endpoint, from any session, shares the same
 * budget. A per-tab client-side queue (see `lib/market/client.ts`) cannot
 * enforce that: it only paces one tab's own requests. `smartapi.ts` (which
 * *is* `server-only`) gates every upstream call through an instance of this,
 * so all of that traffic funnels through one shared budget before it reaches
 * Angel One.
 *
 * Angel One documents more than one window per endpoint (e.g. getCandleData
 * is 3/sec *and* 150/min — the minute cap is the tighter one under sustained
 * load, since 3/sec sustained is 180/min). A single window would miss that,
 * so this tracks recent call timestamps and is satisfied only once every
 * configured window is under its cap.
 *
 * Deliberately not tagged `server-only` itself — unlike `smartapi.ts`, this
 * file holds no key and makes no network call, so it is pure transform, and
 * the only way a test can hold its sliding-window arithmetic and queue
 * ordering to account.
 */

export interface RateWindow {
  ms: number;
  max: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RateLimiter {
  private timestamps: number[] = [];
  /** Serializes acquisitions: concurrent callers each wait their own turn,
   *  computed against the reservations ahead of them, not just the ones
   *  already recorded when they started waiting. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly windows: RateWindow[]) {}

  private prune(now: number): void {
    const horizon = Math.max(...this.windows.map((w) => w.ms));
    while (this.timestamps.length && now - this.timestamps[0] > horizon) {
      this.timestamps.shift();
    }
  }

  /** How long until every window would accept one more call, 0 if now. */
  private waitMs(now: number): number {
    this.prune(now);
    let wait = 0;
    for (const w of this.windows) {
      const inWindow = this.timestamps.filter((t) => now - t < w.ms);
      if (inWindow.length >= w.max) {
        wait = Math.max(wait, inWindow[0] + w.ms - now);
      }
    }
    return wait;
  }

  /** Resolves once a slot is free, and reserves it immediately. */
  async acquire(): Promise<void> {
    const turn = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        const wait = this.waitMs(now);
        if (wait <= 0) {
          this.timestamps.push(now);
          return;
        }
        await sleep(wait);
      }
    });
    // The queue must advance even if this turn's caller never awaits its
    // result, or a slow/abandoned request would stall everyone behind it.
    this.queue = turn.catch(() => undefined);
    return turn;
  }
}
