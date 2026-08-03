import "server-only";

import { RrgEngine } from "@/lib/engine/rrg";
import { BENCHMARK_BHAVCOPY_NAME, SECTORS } from "./config";
import { fetchIndexCloses } from "./bhavcopy";
import type { SectorRotationPoint, SectorRotationSnapshot } from "./types";

export type { SectorRotationPoint, SectorRotationSnapshot } from "./types";

/**
 * Sector rotation, built from NSE's own daily index bhavcopy rather than
 * live ticks — there is no streaming feed for this dashboard (public,
 * no-login, `nse-bse-api`-only), so the RRG advances one trading day at a
 * time instead of once a tick. `RrgEngine` does not care which: it only
 * ever sees a `(token, price, benchmark)` triple and has no notion of time
 * granularity, which is exactly why it was reusable here unmodified.
 *
 * Tuned shorter than the option-premium engine's defaults (`window=40,
 * momentumLookback=5, tailLength=12` in `lib/engine/rrg.ts`) because those
 * were sized for many updates per session; here one "sample" is one trading
 * day, so a 40-sample window would need two calendar months of backfill
 * before a single sector matures. `window=20` (~1 trading month),
 * `momentumLookback=5` (~1 trading week — the standard RRG "tail" cadence),
 * `minSamples=10` (~2 weeks) mature well inside the ~25-trading-day backfill
 * below.
 */
const WINDOW = 20;
const MOMENTUM_LOOKBACK = 5;
const TAIL_LENGTH = 10;
const MIN_SAMPLES = 10;

/** Calendar days walked backward to collect ~25 trading days of closes. */
const BACKFILL_CALENDAR_DAYS = 40;
const FETCH_CONCURRENCY = 4;

interface DailyCloses {
  date: string;
  closes: Map<string, number>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Run up to `limit` jobs at once, preserving each job's own result slot. */
async function pooled<T>(jobs: (() => Promise<T | null>)[], limit: number): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(jobs.length).fill(null);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      try {
        results[i] = await jobs[i]!();
      } catch {
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

/**
 * Walk back `BACKFILL_CALENDAR_DAYS` calendar days, keep whichever came back
 * non-empty (NSE has no bhavcopy for weekends/holidays, and none yet for
 * today until after the close), sorted oldest-first for the engine to
 * replay in order.
 */
async function backfillDailyCloses(): Promise<DailyCloses[]> {
  const today = new Date();
  const jobs = Array.from({ length: BACKFILL_CALENDAR_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (i + 1)); // start from yesterday
    return async (): Promise<DailyCloses | null> => {
      const closes = await fetchIndexCloses(d);
      return closes.size > 0 ? { date: isoDate(d), closes } : null;
    };
  });

  const rows = (await pooled(jobs, FETCH_CONCURRENCY)).filter(
    (r): r is DailyCloses => r !== null,
  );
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

interface CacheEntry {
  at: number;
  value: SectorRotationSnapshot;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 15 * 60_000;

export async function getSectorRotation(): Promise<SectorRotationSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const days = await backfillDailyCloses();
  if (days.length === 0) {
    throw new Error("no NSE index bhavcopy data available for the backfill window");
  }

  const engine = new RrgEngine(WINDOW, MOMENTUM_LOOKBACK, TAIL_LENGTH, MIN_SAMPLES);
  let benchmarkClose = 0;
  let benchmarkPrevClose = 0;
  const prevClose = new Map<string, number>();
  const lastClose = new Map<string, number>();

  for (const day of days) {
    const bench = day.closes.get(BENCHMARK_BHAVCOPY_NAME);
    if (!bench || bench <= 0) continue;

    for (const sector of SECTORS) {
      const close = day.closes.get(sector.bhavcopyName);
      if (!close || close <= 0) continue;
      prevClose.set(sector.bhavcopyName, lastClose.get(sector.bhavcopyName) ?? close);
      lastClose.set(sector.bhavcopyName, close);
      engine.update(sector.bhavcopyName, close, bench);
    }

    benchmarkPrevClose = benchmarkClose || bench;
    benchmarkClose = bench;
  }

  const sectors: SectorRotationPoint[] = [];
  for (const sector of SECTORS) {
    const point = engine.point(sector.bhavcopyName);
    const close = lastClose.get(sector.bhavcopyName);
    if (!point || !close) continue;
    const prev = prevClose.get(sector.bhavcopyName) ?? close;
    sectors.push({
      label: sector.label,
      bhavcopyName: sector.bhavcopyName,
      constituentSlug: sector.constituentSlug,
      close,
      changePct: prev > 0 ? ((close - prev) / prev) * 100 : 0,
      quadrant: engine.quadrant(sector.bhavcopyName) ?? "LAGGING",
      rs_ratio: point.rs_ratio,
      rs_momentum: point.rs_momentum,
      tail: engine.tail(sector.bhavcopyName),
    });
  }

  const snapshot: SectorRotationSnapshot = {
    asOf: days[days.length - 1]!.date,
    benchmark: {
      label: "Nifty 50",
      close: benchmarkClose,
      changePct:
        benchmarkPrevClose > 0
          ? ((benchmarkClose - benchmarkPrevClose) / benchmarkPrevClose) * 100
          : 0,
    },
    sectors: sectors.sort((a, b) => b.rs_ratio - a.rs_ratio),
  };

  cache = { at: Date.now(), value: snapshot };
  return snapshot;
}
