import "server-only";

import { INDEX_UNIVERSE } from "@/lib/engine/config";
import type { Instrument, MasterPayload } from "@/lib/engine/scripMaster";

import { INSTRUMENT_MASTER_URL } from "./dhan";

/**
 * Dhan's combined instrument master, parsed and projected server-side —
 * the counterpart to `app/api/master/route.ts`'s Angel One path.
 *
 * One CSV (`api-scrip-master-detailed.csv`) covers every exchange and
 * segment — NSE, BSE and MCX in a single file — which is what actually
 * solves "segment-wise only": the per-segment REST endpoint
 * (`/v2/instrument/{exchangeSegment}`) would need one request per segment
 * per exchange (NSE_EQ, NSE_FNO, NSE_I, BSE_EQ, BSE_FNO, BSE_I, …) to cover
 * the same ground this one download does.
 *
 * Also simpler than Angel One's projection: Dhan's `UNDERLYING_SYMBOL`
 * matches `INDEX_UNIVERSE`'s keys exactly (`NIFTY`, `BANKNIFTY`, `FINNIFTY`,
 * `BANKEX`, `SENSEX`) — no fuzzy alias matching — and strikes/expiries are
 * already in rupees / ISO `YYYY-MM-DD`, not paise / `29AUG2024`.
 */

const EXPIRY_DEPTH = 3;
/** In-process cache: the file is ~34 MB, re-parsing it per request would be the single most expensive thing this route does. */
const CACHE_MS = 60 * 60 * 1000;

export interface DhanFuture {
  securityId: string;
  exchSeg: "NFO" | "BFO";
  expiry: string;
}

export interface DhanMasterIndex {
  generatedAt: string;
  totalRecords: number;
  spots: Record<string, Instrument>;
  options: Record<string, Instrument[]>;
  /** Nearest-expiry FUTIDX contract per underlying — what OI-buildup classification is computed against. */
  futures: Record<string, DhanFuture>;
  /**
   * India VIX's own spot row — server-only, never part of `toMasterPayload`.
   * Not a tradeable underlying so it sits outside `INDEX_UNIVERSE` and the
   * main per-row filter below; captured separately for the live-VIX quote
   * path (`getDhanVix`), which needs its security id to call `dhanQuote`.
   */
  vixSpot: Instrument | null;
}

let cached: { at: number; index: Promise<DhanMasterIndex> } | null = null;

/** Minimal CSV split — the Dhan master's fields never contain a comma, so no quoting to handle. */
function splitCsv(line: string): string[] {
  return line.split(",");
}

function exchSegFor(exchId: string, segment: string): "NFO" | "NSE" | "BSE" | "BFO" | null {
  if (segment === "D") return exchId === "BSE" ? "BFO" : "NFO";
  if (segment === "I" || segment === "E") return exchId === "BSE" ? "BSE" : "NSE";
  return null;
}

async function parseDhanMaster(): Promise<DhanMasterIndex> {
  const res = await fetch(INSTRUMENT_MASTER_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Dhan instrument master download failed (HTTP ${res.status}).`);
  }
  const text = await res.text();
  const lines = text.split("\n");

  const header = splitCsv(lines[0] ?? "");
  const col = (name: string) => header.indexOf(name);
  const iExch = col("EXCH_ID");
  const iSeg = col("SEGMENT");
  const iSecId = col("SECURITY_ID");
  const iInstrument = col("INSTRUMENT");
  const iUnderlying = col("UNDERLYING_SYMBOL");
  const iSymbolName = col("SYMBOL_NAME");
  // `SYMBOL_NAME` is a generic per-segment code ("BSXOPT" for every single
  // SENSEX option, "NIFTYOPT" for every NIFTY one) — useless as a trading
  // symbol since it doesn't even tell two contracts apart. `DISPLAY_NAME`
  // ("SENSEX 24 SEP 68000 CALL") is the actual descriptive one, confirmed
  // against a live master fetch; still falls back to SYMBOL_NAME if a row's
  // DISPLAY_NAME is ever blank.
  const iDisplayName = col("DISPLAY_NAME");
  const iLotSize = col("LOT_SIZE");
  const iExpiry = col("SM_EXPIRY_DATE");
  const iStrike = col("STRIKE_PRICE");
  const iOptionType = col("OPTION_TYPE");

  const spots: Record<string, Instrument> = {};
  const options: Record<string, Instrument[]> = {};
  const futuresByUnderlying: Record<string, DhanFuture[]> = {};
  const today = new Date().toISOString().slice(0, 10);
  let vixSpot: Instrument | null = null;

  let totalRecords = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    totalRecords++;

    const exchId = line.slice(0, line.indexOf(",")); // cheap fast-path before a full split
    if (exchId !== "NSE" && exchId !== "BSE") continue;

    const row = splitCsv(line);
    const segment = row[iSeg];
    const exchSeg = exchSegFor(exchId, segment);
    if (!exchSeg) continue;

    const underlying = (row[iUnderlying] ?? row[iSymbolName] ?? "").trim().toUpperCase();

    if (!vixSpot && exchId === "NSE" && underlying === "INDIA VIX" && row[iInstrument] === "INDEX") {
      vixSpot = {
        token: row[iSecId],
        symbol: "INDIA VIX",
        name: "INDIA VIX",
        exchSeg,
        strike: 0,
        lotSize: 1,
        expiry: null,
        optionType: null,
      };
    }

    const spec = INDEX_UNIVERSE[underlying];
    if (!spec) continue;
    if (spec.exchange !== exchId) continue; // same cross-segment guard as Angel One's projection

    const instrument = row[iInstrument];
    const securityId = row[iSecId];

    if (instrument === "INDEX" && !spots[underlying]) {
      spots[underlying] = {
        token: securityId,
        symbol: underlying,
        name: underlying,
        exchSeg,
        strike: 0,
        lotSize: 1,
        expiry: null,
        optionType: null,
      };
      continue;
    }

    if (instrument === "FUTIDX") {
      const expiry = (row[iExpiry] ?? "").trim();
      if (expiry) {
        (futuresByUnderlying[underlying] ??= []).push({
          securityId,
          exchSeg: exchSeg === "BSE" || exchSeg === "BFO" ? "BFO" : "NFO",
          expiry,
        });
      }
      continue;
    }

    if (instrument !== "OPTIDX") continue;

    const optionType = row[iOptionType];
    if (optionType !== "CE" && optionType !== "PE") continue;
    const expiry = (row[iExpiry] ?? "").trim();
    if (!expiry) continue;

    (options[underlying] ??= []).push({
      token: securityId,
      symbol: row[iDisplayName] || row[iSymbolName] || "",
      name: underlying,
      exchSeg: exchSeg === "BSE" || exchSeg === "BFO" ? "BFO" : "NFO",
      strike: Number(row[iStrike] ?? 0) || 0,
      lotSize: Math.trunc(Number(row[iLotSize] ?? 0)) || 0,
      expiry,
      optionType,
    });
  }

  // Front expiries only — the whole chain would be megabytes again.
  for (const [underlying, list] of Object.entries(options)) {
    const expiries = [...new Set(list.map((c) => c.expiry!))].sort();
    const future = expiries.filter((e) => e >= today);
    const keep = new Set((future.length ? future : expiries.slice(-EXPIRY_DEPTH)).slice(0, EXPIRY_DEPTH));
    options[underlying] = list.filter((c) => c.expiry && keep.has(c.expiry));
  }

  const futures: Record<string, DhanFuture> = {};
  for (const [underlying, list] of Object.entries(futuresByUnderlying)) {
    const sorted = [...list].sort((a, b) => a.expiry.localeCompare(b.expiry));
    futures[underlying] = sorted.find((f) => f.expiry >= today) ?? sorted[sorted.length - 1];
  }

  // Fallback spot tokens — the live IDX_I security IDs, confirmed directly
  // against a live master fetch, same posture as Angel One's spotTokenFallback.
  const FALLBACK_SPOT_ID: Record<string, string> = {
    NIFTY: "13",
    BANKNIFTY: "25",
    FINNIFTY: "27",
    SENSEX: "51",
    BANKEX: "69",
  };
  for (const [underlying, spec] of Object.entries(INDEX_UNIVERSE)) {
    if (spots[underlying] || !FALLBACK_SPOT_ID[underlying]) continue;
    console.warn(`[dhanMaster] ${underlying} spot not found in the live master — falling back to ${FALLBACK_SPOT_ID[underlying]}.`);
    spots[underlying] = {
      token: FALLBACK_SPOT_ID[underlying],
      symbol: spec.label,
      name: underlying,
      exchSeg: spec.exchange,
      strike: 0,
      lotSize: 1,
      expiry: null,
      optionType: null,
    };
  }

  // Same fallback posture as `FALLBACK_SPOT_ID` above — India VIX's live
  // IDX_I security id, confirmed directly against a live master fetch.
  if (!vixSpot) {
    console.warn("[dhanMaster] INDIA VIX spot not found in the live master — falling back to security id 21.");
    vixSpot = {
      token: "21",
      symbol: "INDIA VIX",
      name: "INDIA VIX",
      exchSeg: "NSE",
      strike: 0,
      lotSize: 1,
      expiry: null,
      optionType: null,
    };
  }

  return { generatedAt: new Date().toISOString(), totalRecords, spots, options, futures, vixSpot };
}

export function loadDhanMaster(): Promise<DhanMasterIndex> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.index;
  const index = parseDhanMaster().catch((err) => {
    cached = null; // a failed parse must not poison the cache for the next request
    throw err;
  });
  cached = { at: Date.now(), index };
  return index;
}

export function toMasterPayload(index: DhanMasterIndex): MasterPayload {
  return {
    generatedAt: index.generatedAt,
    totalRecords: index.totalRecords,
    spots: index.spots,
    options: index.options,
  };
}
