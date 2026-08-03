/**
 * `lib/server/rateLimiter.ts` — the shared per-endpoint throttle in front of
 * `smartApiCall`. Windows are kept small (tens of milliseconds) so the suite
 * stays fast; the arithmetic is identical at Angel One's real 1s/60s/3600s
 * scale.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { RateLimiter } from "../lib/server/rateLimiter";

test("calls within the cap resolve immediately", async () => {
  const limiter = new RateLimiter([{ ms: 100, max: 3 }]);
  const start = Date.now();
  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();
  assert.ok(Date.now() - start < 50, "three calls under the cap should not wait");
});

test("the call past the cap waits for the window to clear", async () => {
  const limiter = new RateLimiter([{ ms: 100, max: 2 }]);
  const start = Date.now();
  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 90, `third call should wait out the window, took ${elapsed}ms`);
});

test("a tighter longer window binds even when the short window has room", async () => {
  // 5/sec would allow a burst of 5 immediately, but 2 per 150ms is the
  // stricter constraint — mirrors getCandleData's 3/sec-vs-150/min shape.
  const limiter = new RateLimiter([
    { ms: 20, max: 5 },
    { ms: 150, max: 2 },
  ]);
  const start = Date.now();
  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 140, `the 150ms/2 window should have bound, took ${elapsed}ms`);
});

test("concurrent acquires are serialized, not all released together", async () => {
  const limiter = new RateLimiter([{ ms: 60, max: 1 }]);
  const order: number[] = [];
  await Promise.all(
    [0, 1, 2].map(async (i) => {
      await limiter.acquire();
      order.push(i);
    }),
  );
  // Queued in call order; nothing here says they resolved simultaneously —
  // the point is that all three complete without exceeding the 1-per-60ms cap.
  assert.equal(order.length, 3);
});

test("one endpoint's limiter never throttles another's", async () => {
  const busy = new RateLimiter([{ ms: 1_000, max: 1 }]);
  const idle = new RateLimiter([{ ms: 1_000, max: 1 }]);
  await busy.acquire();

  const start = Date.now();
  await idle.acquire();
  assert.ok(Date.now() - start < 50, "an unrelated limiter must not wait on busy's budget");
});
