import type { Candle, OiBuildupRow, OiPoint, PcrRow } from "@/lib/types";
import type { DhanIntradayResponse, DhanOptionChain } from "@/lib/server/dhan";

/**
 * Normalisers for Dhan's Data API payloads — the counterpart to
 * `lib/market/parse.ts`'s Angel One parsers, producing the exact same
 * app-level shapes (`Candle`, `OiPoint`, `PcrRow`, `OiBuildupRow`) so nothing
 * downstream of the route handlers needs to know which broker answered.
 *
 * Dhan's own quirk: `/charts/intraday` and `/charts/historical` return
 * *columnar* arrays (`{open:[], high:[], ...}`), not row objects — one
 * candle is index `i` across every array, not an object of its own.
 */

/** Epoch seconds → the same `YYYY-MM-DDTHH:mm:ss+05:30` shape Angel One's candles carry, so `candleDate()`/sort-by-string keep working unmodified. */
function epochToIst(epochSeconds: number): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(epochSeconds * 1000)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:30`;
}

export function parseDhanCandles(data: DhanIntradayResponse): Candle[] {
  const n = data.timestamp?.length ?? 0;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      time: epochToIst(data.timestamp[i]),
      open: data.open[i] ?? 0,
      high: data.high[i] ?? 0,
      low: data.low[i] ?? 0,
      close: data.close[i] ?? 0,
      volume: data.volume[i] ?? 0,
    });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export function parseDhanOiSeries(data: DhanIntradayResponse): OiPoint[] {
  const n = data.timestamp?.length ?? 0;
  if (!data.open_interest) return [];
  const out: OiPoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ time: epochToIst(data.timestamp[i]), oi: data.open_interest[i] ?? 0 });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Dhan has no whole-exchange `putCallRatio` endpoint — this is a per-underlying
 * approximation, ΣPE-OI / ΣCE-OI across the fetched chain's strikes, rather
 * than Angel One's cumulative-across-every-symbol read. `underlying` is
 * carried explicitly (see `PcrRow.underlying`) rather than encoded into a
 * synthetic futures-symbol string, so `pcrForUnderlying` can match it
 * directly instead of parsing a fake trading symbol.
 */
export function pcrFromOptionChain(chain: DhanOptionChain, underlying: string): PcrRow {
  let ceOi = 0;
  let peOi = 0;
  for (const leg of Object.values(chain.oc)) {
    ceOi += leg.ce?.oi ?? 0;
    peOi += leg.pe?.oi ?? 0;
  }
  return {
    pcr: ceOi > 0 ? Number((peOi / ceOi).toFixed(3)) : 0,
    trading_symbol: underlying,
    underlying,
  };
}

export type BuildupClass = "Long Built Up" | "Short Built Up" | "Short Covering" | "Long Unwinding";

/**
 * Standard price/OI-change quadrant classification (price↑ + OI↑ = Long
 * Built Up; price↑ + OI↓ = Short Covering; price↓ + OI↑ = Short Built Up;
 * price↓ + OI↓ = Long Unwinding), applied to a near-month futures contract —
 * the same instrument Angel One's `OIBuildup` classifies, computed locally
 * rather than read pre-classified from a whole-board endpoint.
 *
 * Dhan's `/marketfeed/quote` carries current `oi` but not *previous* OI, so
 * the previous session's close/OI come from a separate daily-historical read
 * (its last completed bar) — see the `buildup` route for how the two are
 * fetched and passed in here already separated.
 */
export function classifyOiBuildup(params: {
  securityId: string;
  tradingSymbol: string;
  current: { ltp: number; oi: number };
  previous: { close: number; oi: number };
}): OiBuildupRow & { buildup: BuildupClass | null } {
  const { current, previous } = params;
  const priceUp = previous.close > 0 ? current.ltp >= previous.close : null;
  const oiUp = current.oi >= previous.oi;
  const netChange = previous.close > 0 ? current.ltp - previous.close : 0;
  const percentChange = previous.close > 0 ? (netChange / previous.close) * 100 : 0;

  let buildup: BuildupClass | null = null;
  if (priceUp !== null) {
    if (priceUp && oiUp) buildup = "Long Built Up";
    else if (priceUp && !oiUp) buildup = "Short Covering";
    else if (!priceUp && oiUp) buildup = "Short Built Up";
    else buildup = "Long Unwinding";
  }

  return {
    symbol_token: params.securityId,
    trading_symbol: params.tradingSymbol,
    ltp: current.ltp,
    net_change: Number(netChange.toFixed(2)),
    percent_change: Number(percentChange.toFixed(2)),
    open_interest: current.oi,
    oi_change: current.oi - previous.oi,
    buildup,
  };
}
