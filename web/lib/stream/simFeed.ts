"use client";

import { INDEX_UNIVERSE } from "@/lib/engine/config";
import type { ScripMaster } from "@/lib/engine/scripMaster";
import { type Tick, emptyTick } from "./ticks";

/**
 * Synthetic tick generator — port of `backend/app/sim_feed.py`.
 *
 * Lets the terminal be driven without a SmartAPI session. The HUD renders a
 * persistent SIMULATED FEED badge whenever it is active: synthetic prints must
 * never be mistaken for live ones.
 */

const SEED_SPOT: Record<string, number> = {
  NIFTY: 24_500,
  BANKNIFTY: 52_000,
  FINNIFTY: 23_400,
};
const IV = 0.14;

function gaussian(): number {
  // Box–Muller: Math.random() alone gives a flat distribution, which produces
  // a visibly unnatural tape.
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function premium(spot: number, strike: number, type: string, tYears: number): number {
  const intrinsic = type === "CE" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const timeValue = spot * IV * Math.sqrt(Math.max(tYears, 1e-4)) * 0.4;
  const decay = Math.exp(-((spot - strike) ** 2) / (2 * (spot * 0.02) ** 2));
  return Math.max(0.05, intrinsic + timeValue * decay);
}

export class SimulatedFeed {
  private spot: Record<string, number> = { ...SEED_SPOT };
  private anchor: Record<string, number> = { ...SEED_SPOT };
  private oi = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  running = false;

  constructor(private onTick: (tick: Tick) => void) {}

  start(master: ScripMaster, intervalMs = 1000): void {
    this.stop();
    this.running = true;
    this.timer = setInterval(() => this.step(master), intervalMs);
    this.step(master);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  step(master: ScripMaster): void {
    const today = new Date();

    for (const [underlying, cfg] of Object.entries(INDEX_UNIVERSE)) {
      const anchor = this.anchor[underlying];
      // Ornstein-Uhlenbeck style drift back toward the session anchor.
      let spot = this.spot[underlying];
      spot += (anchor - spot) * 0.02 + gaussian() * anchor * 0.0006;
      this.spot[underlying] = spot;

      const spotToken = master.spotToken(underlying);
      if (spotToken) {
        const t = emptyTick(spotToken);
        t.ltp = Number(spot.toFixed(2));
        t.close = Number(anchor.toFixed(2));
        t.open = t.close;
        t.high = Number(Math.max(spot, anchor).toFixed(2));
        t.low = Number(Math.min(spot, anchor).toFixed(2));
        t.exchangeTs = Date.now();
        this.onTick(t);
      }

      const expiry = master.nearestExpiry(underlying);
      if (!expiry) continue;
      const days = Math.max(
        0,
        (new Date(expiry).getTime() - today.getTime()) / 86_400_000,
      );
      const tYears = days / 365;
      const step = cfg.strikeStep;

      for (const inst of master.contracts(underlying, expiry)) {
        if (Math.abs(inst.strike - spot) > step * 14) continue;

        const px = Number(
          (
            premium(spot, inst.strike, inst.optionType ?? "CE", tYears) *
            (0.997 + Math.random() * 0.006)
          ).toFixed(2),
        );

        let base = this.oi.get(inst.token);
        if (base === undefined) {
          base = Math.floor(Math.abs(gaussian()) * 200_000) + 25_000;
          this.oi.set(inst.token, base);
        }
        // Writers pile in near spot: puts below, calls above.
        const pull = Math.exp(-Math.abs(inst.strike - spot) / (step * 4));
        const growth = Math.floor(pull * (Math.random() * 1800 - 400));
        const next = Math.max(1000, (this.oi.get(inst.token) ?? base) + growth);
        this.oi.set(inst.token, next);

        const t = emptyTick(inst.token);
        t.ltp = px;
        t.close = Number((px * 0.98).toFixed(2));
        t.volume = Math.floor(pull * (1e4 + Math.random() * 7e4));
        t.oi = next;
        t.oiChangePct = Number(((growth / Math.max(base, 1)) * 100).toFixed(3));
        t.bestBid = Number((px * 0.998).toFixed(2));
        t.bestAsk = Number((px * 1.002).toFixed(2));
        t.exchangeTs = Date.now();
        this.onTick(t);
      }
    }
  }
}
