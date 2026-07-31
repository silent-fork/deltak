/**
 * Last-value tick cache — port of `TickStore` in `backend/app/ws_manager.py`.
 *
 * Snap-quote frames occasionally omit fields, so values are carried forward
 * rather than zeroed; and the first open-interest reading of the session is
 * retained per token so COA 2.0 can compute intraday ΔOI.
 */

export interface Tick {
  token: string;
  ltp: number;
  volume: number;
  oi: number;
  oiChangePct: number;
  bestBid: number;
  bestAsk: number;
  open: number;
  high: number;
  low: number;
  close: number;
  exchangeTs: number;
}

export function emptyTick(token: string): Tick {
  return {
    token,
    ltp: 0,
    volume: 0,
    oi: 0,
    oiChangePct: 0,
    bestBid: 0,
    bestAsk: 0,
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    exchangeTs: 0,
  };
}

export class TickStore {
  private ticks = new Map<string, Tick>();
  private prev = new Map<string, number>();
  private sessionOpenOi = new Map<string, number>();
  updates = 0;
  lastUpdateAt = 0;

  apply(tick: Tick): Tick {
    const previous = this.ticks.get(tick.token);
    if (previous) {
      this.prev.set(tick.token, previous.ltp);
      if (!tick.volume) tick.volume = previous.volume;
      if (!tick.oi) tick.oi = previous.oi;
      if (!tick.close) tick.close = previous.close;
      if (!tick.bestBid) tick.bestBid = previous.bestBid;
      if (!tick.bestAsk) tick.bestAsk = previous.bestAsk;
    }
    if (tick.oi && !this.sessionOpenOi.has(tick.token)) {
      this.sessionOpenOi.set(tick.token, tick.oi);
    }
    this.ticks.set(tick.token, tick);
    this.updates += 1;
    this.lastUpdateAt = Date.now();
    return tick;
  }

  get(token: string): Tick | undefined {
    return this.ticks.get(token);
  }

  ltp(token: string, fallback = 0): number {
    return this.ticks.get(token)?.ltp || fallback;
  }

  prevLtp(token: string): number {
    return this.prev.get(token) ?? 0;
  }

  /** COA 2.0 — open interest added or unwound since the session's first print. */
  oiChange(token: string): number {
    const t = this.ticks.get(token);
    if (!t) return 0;
    return t.oi - (this.sessionOpenOi.get(token) ?? t.oi);
  }

  resetSession(): void {
    this.sessionOpenOi.clear();
  }
}
