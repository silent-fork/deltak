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

const clip = (v: number) => Math.max(100 - AXIS_CLIP, Math.min(100 + AXIS_CLIP, v));

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
  last: RrgPoint | null;
}

export class RrgEngine {
  private nodes = new Map<string, NodeState>();

  constructor(
    private window = 40,
    private momentumLookback = 5,
    private tailLength = 12,
  ) {}

  private state(token: string): NodeState {
    let s = this.nodes.get(token);
    if (!s) {
      s = { rs: [], tail: [], samples: 0, last: null };
      this.nodes.set(token, s);
    }
    return s;
  }

  update(token: string, price: number, benchmark: number): RrgPoint {
    const s = this.state(token);
    if (price <= 0 || benchmark <= 0) {
      return s.last ?? { rs_ratio: 100, rs_momentum: 100 };
    }

    s.samples += 1;
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
    if (s.samples < MIN_SAMPLES) {
      const damp = s.samples / MIN_SAMPLES;
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
    return !!s && s.samples >= MIN_SAMPLES;
  }

  reset(token?: string): void {
    if (token === undefined) this.nodes.clear();
    else this.nodes.delete(token);
  }
}
