import type { Candle, OiPoint } from "@/lib/types";

/**
 * Wall migration, reconstructed from historical open interest.
 *
 * The live engine builds this trail by watching COA 2.0 move while the tab is
 * open, which means it starts empty every refresh and stays empty when the
 * market is shut. But the walls' whole history is already implied by the
 * per-contract OI series the baseline pass fetches: run the same COA 2.0 rule
 * — the biggest put build below spot, the biggest call build above it — at
 * every bucket in the session, and the migration falls out with no extra
 * requests.
 *
 * Pure, and deliberately so: this is the strategy's own rule applied to a past
 * session, and it should be checkable without a network or a clock.
 */

export interface StrikeLegs {
  strike: number;
  callToken?: string | null;
  putToken?: string | null;
}

export interface WallTrail {
  /** Bucket timestamps, oldest first. */
  times: string[];
  aegis: number[];
  zenith: number[];
}

/** Spot at a bucket: the last bar at or before it. */
export function spotAtFactory(candles: Candle[]): (time: string) => number {
  const sorted = [...candles].sort((a, b) => a.time.localeCompare(b.time));
  return (time: string) => {
    let last = 0;
    for (const c of sorted) {
      if (c.time > time) break;
      last = c.close;
    }
    return last;
  };
}

export function reconstructWallTrail(
  rows: StrikeLegs[],
  oiSeries: Record<string, OiPoint[]>,
  spotAt: (time: string) => number,
): WallTrail {
  const empty: WallTrail = { times: [], aegis: [], zenith: [] };

  // Every bucket any contract reported, and each contract's readings by time.
  const times = new Set<string>();
  const byToken = new Map<string, { open: number; at: Map<string, number> }>();

  for (const token of new Set(
    rows.flatMap((r) => [r.callToken, r.putToken]).filter((t): t is string => !!t),
  )) {
    const series = oiSeries[token];
    if (!series?.length) continue;
    const at = new Map<string, number>();
    for (const p of series) {
      at.set(p.time, p.oi);
      times.add(p.time);
    }
    byToken.set(token, { open: series[0].oi, at });
  }
  if (!byToken.size) return empty;

  const ordered = [...times].sort();
  const trail: WallTrail = { times: [], aegis: [], zenith: [] };

  // Carried forward per token: a strike that did not trade in a bucket keeps
  // the open interest it last reported rather than dropping to zero.
  const latest = new Map<string, number>();

  for (const time of ordered) {
    for (const [token, state] of byToken) {
      const reading = state.at.get(time);
      if (reading !== undefined) latest.set(token, reading);
    }

    const spot = spotAt(time);
    if (spot <= 0) continue;

    let aegis: { strike: number; build: number } | null = null;
    let zenith: { strike: number; build: number } | null = null;

    for (const row of rows) {
      if (row.putToken && row.strike <= spot) {
        const state = byToken.get(row.putToken);
        const now = latest.get(row.putToken);
        if (state && now !== undefined) {
          const build = now - state.open;
          if (build > 0 && (!aegis || build > aegis.build)) {
            aegis = { strike: row.strike, build };
          }
        }
      }
      if (row.callToken && row.strike >= spot) {
        const state = byToken.get(row.callToken);
        const now = latest.get(row.callToken);
        if (state && now !== undefined) {
          const build = now - state.open;
          if (build > 0 && (!zenith || build > zenith.build)) {
            zenith = { strike: row.strike, build };
          }
        }
      }
    }

    // Both walls or neither: a trail where one line is a bucket ahead of the
    // other is a trail whose two lines are not the same session.
    if (!aegis || !zenith) continue;
    trail.times.push(time);
    trail.aegis.push(aegis.strike);
    trail.zenith.push(zenith.strike);
  }

  return trail;
}
