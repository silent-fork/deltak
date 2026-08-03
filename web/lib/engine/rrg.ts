import type { Quadrant, RrgPoint } from "@/lib/types";

/**
 * Relative Rotation Graph engine — TypeScript port of `backend/app/engine/rrg.py`.
 *
 * Each option strike rotates against its index spot:
 *   RS          = 100 × premium / spot
 *   RS-Ratio    = 100 × RS / mean(RS, window)      — trend position
 *   RS-Momentum = 100 × RS / RS[t−k]               — rate of change of that line
 *
 * Momentum is taken on the RS line rather than on RS-Ratio deliberately: the
 * rate of change of an already-normalised series saturates under a steady trend
 * and parks genuinely trending nodes back at the origin. The raw ROC also turns
 * first, which is what produces the clockwise rotation the HUD draws.
 */

export const AXIS_CLIP = 12;
export const MIN_SAMPLES = 8;

export function classifyQuadrant(
  rsRatio: number,
  rsMomentum: number,
): Quadrant {
  if (rsRatio >= 100) return rsMomentum >= 100 ? "LEADING" : "WEAKENING";
  return rsMomentum >= 100 ? "IMPROVING" : "LAGGING";
}

/**
 * Soft-bounded rather than hard-clamped: a hard `Math.max`/`Math.min` pins
 * every node beyond the edge to the exact same coordinate, so a strongly
 * leading node and a wildly leading node land on top of each other and read
 * as identical. `tanh` approaches the same ±`AXIS_CLIP` bound asymptotically
 * without ever flattening it — nodes stay visually ordered by how extreme
 * they actually are, all the way to the edge.
 */
const clip = (v: number) => 100 + AXIS_CLIP * Math.tanh((v - 100) / AXIS_CLIP);

function ratioToMean(series: number[]): number {
  if (series.length === 0) return 100;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  if (Math.abs(mean) <= 1e-12) return 100;
  return clip((100 * series[series.length - 1]) / mean);
}

interface NodeState {
  rs: number[];
  tail: RrgPoint[];
  samples: number;
  /** The last price a `samples` increment was actually earned by. */
  lastPrice: number | null;
  last: RrgPoint | null;
}

export class RrgEngine {
  private nodes = new Map<string, NodeState>();

  constructor(
    private window = 40,
    private momentumLookback = 5,
    private tailLength = 12,
    /** Genuine-price-change threshold before a node matures. Per-instance so a thinly-traded underlying can mature sooner than the shared default. */
    private minSamples = MIN_SAMPLES,
  ) {}

  private state(token: string): NodeState {
    let s = this.nodes.get(token);
    if (!s) {
      s = { rs: [], tail: [], samples: 0, lastPrice: null, last: null };
      this.nodes.set(token, s);
    }
    return s;
  }

  update(token: string, price: number, benchmark: number): RrgPoint {
    const s = this.state(token);
    if (price <= 0 || benchmark <= 0) {
      return s.last ?? { rs_ratio: 100, rs_momentum: 100 };
    }

    /**
     * The caller advances every node once a second whenever *anything* in
     * the whole tick universe printed, not when this particular contract
     * did — an untraded strike's `price` is simply carried forward, so most
     * calls here repeat the same value rather than deliver new information.
     * Counting those as samples let a leg that hasn't traded in a minute
     * still reach `MIN_SAMPLES` on the clock alone, and get plotted with the
     * same confidence as one that is actually printing. Only a genuine price
     * change earns a sample; the window below still advances every call, so
     * the ratio's mean stays a real rolling average rather than one padded
     * with copies of a stale print.
     */
    if (s.lastPrice === null || price !== s.lastPrice) {
      s.samples += 1;
      s.lastPrice = price;
    }
    s.rs.push((100 * price) / benchmark);
    const cap = Math.max(this.window, this.momentumLookback + 1);
    if (s.rs.length > cap) s.rs.shift();

    let rsRatio = ratioToMean(s.rs);

    let rsMomentum = 100;
    if (s.rs.length > this.momentumLookback) {
      const past = s.rs[s.rs.length - 1 - this.momentumLookback];
      if (Math.abs(past) > 1e-12) {
        rsMomentum = clip((100 * s.rs[s.rs.length - 1]) / past);
      }
    }

    // Until we have a meaningful sample, pull the node toward the origin so the
    // HUD does not present noise as conviction.
    if (s.samples < this.minSamples) {
      const damp = s.samples / this.minSamples;
      rsRatio = 100 + (rsRatio - 100) * damp;
      rsMomentum = 100 + (rsMomentum - 100) * damp;
    }

    const point: RrgPoint = {
      rs_ratio: Number(rsRatio.toFixed(4)),
      rs_momentum: Number(rsMomentum.toFixed(4)),
    };
    s.tail.push(point);
    if (s.tail.length > this.tailLength) s.tail.shift();
    s.last = point;
    return point;
  }

  point(token: string): RrgPoint | null {
    return this.nodes.get(token)?.last ?? null;
  }

  quadrant(token: string): Quadrant | null {
    const p = this.point(token);
    return p ? classifyQuadrant(p.rs_ratio, p.rs_momentum) : null;
  }

  tail(token: string): RrgPoint[] {
    return this.nodes.get(token)?.tail.slice() ?? [];
  }

  matured(token: string): boolean {
    const s = this.nodes.get(token);
    return !!s && s.samples >= this.minSamples;
  }

  reset(token?: string): void {
    if (token === undefined) this.nodes.clear();
    else this.nodes.delete(token);
  }
}
