import { INDEX_UNIVERSE } from "./config";

/**
 * Option universe projection — port of `backend/app/scrip_master.py`.
 *
 * The raw scrip master is ~40 MB, far too much to ship to a browser. The
 * `/api/master` route handler does the download and projection server-side and
 * returns only the five-index option slice (INDEX_UNIVERSE), which is a few
 * hundred KB. This module holds the client-side model over that slice.
 */

export interface Instrument {
  token: string;
  symbol: string;
  name: string;
  exchSeg: "NFO" | "NSE" | "BSE" | "BFO";
  strike: number;
  lotSize: number;
  /** ISO date, or null for index spots. */
  expiry: string | null;
  optionType: "CE" | "PE" | null;
}

export interface MasterPayload {
  generatedAt: string;
  totalRecords: number;
  spots: Record<string, Instrument>;
  /** underlying -> instruments, nearest expiries only. */
  options: Record<string, Instrument[]>;
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** Parse the `29AUG2024` expiry format used by the scrip master. */
export function parseExpiry(raw: string): string | null {
  const s = (raw ?? "").trim().toUpperCase();
  if (s.length < 9) return null;
  const day = Number(s.slice(0, 2));
  const mon = MONTHS[s.slice(2, 5)];
  const year = Number(s.slice(5, 9));
  if (!day || !mon || !year) return null;
  return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export class ScripMaster {
  readonly spots: Record<string, Instrument>;
  private byUnderlying: Record<string, Instrument[]>;
  private byToken = new Map<string, Instrument>();
  readonly totalRecords: number;

  constructor(payload?: MasterPayload) {
    this.spots = payload?.spots ?? {};
    this.byUnderlying = payload?.options ?? {};
    this.totalRecords = payload?.totalRecords ?? 0;
    for (const inst of Object.values(this.spots)) this.byToken.set(inst.token, inst);
    for (const list of Object.values(this.byUnderlying)) {
      for (const inst of list) this.byToken.set(inst.token, inst);
    }
  }

  get ready(): boolean {
    return Object.keys(this.spots).length > 0 && Object.keys(this.byUnderlying).length > 0;
  }

  expiries(underlying: string): string[] {
    const set = new Set<string>();
    for (const c of this.byUnderlying[underlying] ?? []) {
      if (c.expiry) set.add(c.expiry);
    }
    return [...set].sort();
  }

  nearestExpiry(underlying: string, on = new Date()): string | null {
    const today = on.toISOString().slice(0, 10);
    const all = this.expiries(underlying);
    return all.find((e) => e >= today) ?? all[all.length - 1] ?? null;
  }

  contracts(underlying: string, expiry?: string | null): Instrument[] {
    const exp = expiry ?? this.nearestExpiry(underlying);
    if (!exp) return [];
    return (this.byUnderlying[underlying] ?? []).filter((c) => c.expiry === exp);
  }

  strikes(underlying: string, expiry?: string | null): number[] {
    const set = new Set(this.contracts(underlying, expiry).map((c) => c.strike));
    return [...set].sort((a, b) => a - b);
  }

  find(
    underlying: string,
    strike: number,
    optionType: "CE" | "PE",
    expiry?: string | null,
  ): Instrument | null {
    return (
      this.contracts(underlying, expiry).find(
        (c) => c.optionType === optionType && Math.abs(c.strike - strike) < 1e-6,
      ) ?? null
    );
  }

  instrument(token: string): Instrument | undefined {
    return this.byToken.get(token);
  }

  /** Most common lot size across the live expiry, falling back to the config. */
  lotSize(underlying: string): number {
    const sizes = this.contracts(underlying)
      .map((c) => c.lotSize)
      .filter((n) => n > 0);
    if (sizes.length) {
      const counts = new Map<number, number>();
      for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    return INDEX_UNIVERSE[underlying]?.lotSize ?? 1;
  }

  spotToken(underlying: string): string {
    return (
      this.spots[underlying]?.token ??
      INDEX_UNIVERSE[underlying]?.spotTokenFallback ??
      ""
    );
  }

  /**
   * Every token the feed should subscribe to, split first by exchange (NSE
   * vs BSE ride different SmartStream exchange-type codes and can't share a
   * subscription message) and then by segment within it.
   */
  subscriptionTokens(spotByUnderlying: Record<string, number>, chainDepth: number) {
    const nse = { spotTokens: [] as string[], optionTokens: [] as string[] };
    const bse = { spotTokens: [] as string[], optionTokens: [] as string[] };

    for (const [underlying, cfg] of Object.entries(INDEX_UNIVERSE)) {
      const bucket = cfg.exchange === "BSE" ? bse : nse;
      const token = this.spotToken(underlying);
      if (token) bucket.spotTokens.push(token);

      const spot = spotByUnderlying[underlying] ?? 0;
      const band = cfg.strikeStep * (chainDepth + 2);
      for (const inst of this.contracts(underlying)) {
        if (spot <= 0 || Math.abs(inst.strike - spot) <= band) {
          bucket.optionTokens.push(inst.token);
        }
      }
    }
    return { nse, bse };
  }
}
