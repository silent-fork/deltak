import { INDEX_UNIVERSE } from "@/lib/engine/config";

/**
 * Dhan-shaped request builders — the counterpart to the Angel One request
 * objects built inline in `useMarketData.ts`. Kept separate so the request
 * shape for each broker stays a one-line swap at each call site rather than
 * two parallel code paths through the same function.
 */

/** `"YYYY-MM-DD HH:mm"` (Angel One's stamp, already IST) → Dhan's `"YYYY-MM-DD HH:mm:ss"`. */
export function toDhanStamp(spaceStamp: string): string {
  return `${spaceStamp}:00`;
}

/** `IDX_I` for every underlying's spot — Dhan's index segment is exchange-agnostic (both NSE's and BSE's indices live under it). */
export const DHAN_SPOT_SEGMENT = "IDX_I";

/** `NSE_FNO` or `BSE_FNO`, matching whichever exchange the underlying's options actually list on. */
export function dhanOptionSegment(underlying: string): "NSE_FNO" | "BSE_FNO" {
  return INDEX_UNIVERSE[underlying]?.exchange === "BSE" ? "BSE_FNO" : "NSE_FNO";
}
