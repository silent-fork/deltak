import "server-only";

import {
  DEFAULT_CONFIG,
  isWeekend,
  istMinutes,
  MARKET_CLOSE_MIN,
  secondsToDaylightRest,
} from "@/lib/engine/config";
import { applySlippage } from "@/lib/engine/ledger";
import { decideExit, type ExitReason } from "@/lib/engine/risk";
import { insertRows, selectFrom, updatePositionByTradeKey } from "@/lib/supabase";
import type { Broker, Side } from "@/lib/types";
import { NoBrokerSessionError, watchdogLtp } from "./watchdogMarket";

/**
 * The guard-only watchdog tick.
 *
 * Re-runs the two guards that need nothing but a position's own numbers and a
 * fresh price — stop/target (`decideExit`) and the 3:15 PM IST Daylight Rest
 * flatten — against every OPEN paper position in Supabase, independent of
 * whether any browser tab is open. Invalidation (needs the COA walls) and the
 * Weakening-quadrant scale-out (needs live RRG rotation) are not decidable
 * this way and stay browser-only until there is a server-side home for that
 * state — see the module doc in `lib/engine/risk.ts`.
 *
 * Live positions are never touched: the query below is filtered to
 * `mode = 'paper'` explicitly, and `bookExit`/`markToMarket` never call
 * anything that can place a broker order — `watchdogMarket.ts` doesn't even
 * import the endpoint that does.
 */

const r2 = (n: number) => Number(n.toFixed(2));
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface OpenPositionRow {
  trade_key: string;
  ledger_id: string;
  client_code: string;
  broker: string | null;
  mode: string;
  underlying: string;
  token: string;
  trading_symbol: string;
  option_type: string | null;
  strike: string | number | null;
  side: string;
  quantity: string | number;
  lots: string | number;
  lot_size: string | number;
  avg_price: string | number;
  stop_loss: string | number | null;
  target: string | number | null;
  protocol: string | null;
}

/** Politeness gap between LTP calls — SmartAPI meters requests per key. */
const LTP_GAP_MS = 350;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface WatchdogTickResult {
  accounts: number;
  positionsChecked: number;
  exits: { ledgerId: string; reason: ExitReason }[];
  skipped: { ledgerId: string; reason: string }[];
  errors: { ledgerId?: string; clientCode?: string; message: string }[];
}

async function markToMarket(row: OpenPositionRow, ltp: number): Promise<void> {
  const avg = num(row.avg_price);
  const direction = row.side === "BUY" ? 1 : -1;
  const unrealisedPnl = r2((ltp - avg) * num(row.quantity) * direction);
  const pnlPct = avg ? r2(((ltp - avg) / avg) * 100 * direction) : 0;

  await updatePositionByTradeKey(row.trade_key, {
    ltp: r2(ltp),
    unrealised_pnl: unrealisedPnl,
    pnl_pct: pnlPct,
  });
}

async function bookExit(row: OpenPositionRow, ltp: number, reason: ExitReason): Promise<void> {
  const avg = num(row.avg_price);
  const quantity = num(row.quantity);
  const direction = row.side === "BUY" ? 1 : -1;
  const exitSide: Side = row.side === "BUY" ? "SELL" : "BUY";
  // Same model the browser's paper fills use — a real exit is a market order,
  // and slippage moves against the taker on both sides of a trade.
  const fill = applySlippage(ltp, exitSide, DEFAULT_CONFIG.slippagePct);
  const realisedPnl = r2((fill - avg) * quantity * direction);
  const pnlPct = avg ? r2(((fill - avg) / avg) * 100 * direction) : 0;
  const closedAt = new Date().toISOString();
  const broker: Broker | null =
    row.broker === "dhan" || row.broker === "angelone" ? row.broker : null;

  await updatePositionByTradeKey(row.trade_key, {
    status: "CLOSED",
    ltp: r2(fill),
    exit_price: r2(fill),
    exit_reason: reason,
    realised_pnl: realisedPnl,
    unrealised_pnl: 0,
    pnl_pct: pnlPct,
    closed_at: closedAt,
  });

  await insertRows(
    "orders",
    [
      {
        mode: row.mode,
        underlying: row.underlying,
        token: row.token,
        trading_symbol: row.trading_symbol,
        transaction_type: exitSide,
        order_type: "MARKET",
        quantity,
        lots: num(row.lots),
        lot_size: num(row.lot_size),
        price: null,
        fill_price: r2(fill),
        status: "ACCEPTED",
        ledger_id: row.ledger_id,
        protocol: row.protocol,
        option_type: row.option_type,
        strike: numOrNull(row.strike),
        message: `WATCHDOG ${reason}`,
      },
    ],
    row.client_code,
    broker,
  );

  await insertRows(
    "events",
    [
      {
        ts: closedAt,
        kind: reason,
        underlying: row.underlying,
        message: `[watchdog] ${row.trading_symbol} ${reason} @ ${fill.toFixed(2)} — closed with no browser tab open.`,
      },
    ],
    row.client_code,
  );
}

export async function runWatchdogTick(): Promise<WatchdogTickResult> {
  const result: WatchdogTickResult = {
    accounts: 0,
    positionsChecked: 0,
    exits: [],
    skipped: [],
    errors: [],
  };

  // A clock event, not a market read — decided once, for every position.
  const daylightRestDue =
    !isWeekend() && istMinutes() <= MARKET_CLOSE_MIN && secondsToDaylightRest() <= 0;

  let rows: OpenPositionRow[];
  try {
    rows = (await selectFrom("positions", {
      status: "eq.OPEN",
      mode: "eq.paper",
    })) as OpenPositionRow[];
  } catch (err) {
    result.errors.push({
      message: err instanceof Error ? err.message : "Failed to read open positions.",
    });
    return result;
  }

  const byAccount = new Map<string, OpenPositionRow[]>();
  for (const row of rows) {
    const list = byAccount.get(row.client_code) ?? [];
    list.push(row);
    byAccount.set(row.client_code, list);
  }
  result.accounts = byAccount.size;

  for (const [clientCode, positions] of byAccount) {
    for (const row of positions) {
      result.positionsChecked += 1;
      try {
        const data = (await watchdogLtp(clientCode, {
          exchange: "NFO",
          tradingsymbol: row.trading_symbol,
          symboltoken: row.token,
        })) as { ltp?: unknown };
        const ltp = num(data.ltp);

        if (ltp <= 0) {
          result.skipped.push({ ledgerId: row.ledger_id, reason: "No live price returned." });
        } else {
          const decision = decideExit({
            side: row.side as Side,
            stopLoss: numOrNull(row.stop_loss),
            target: numOrNull(row.target),
            ltp,
            daylightRestDue,
          });

          if (decision.action === "HOLD") {
            await markToMarket(row, ltp);
          } else {
            await bookExit(row, ltp, decision.action);
            result.exits.push({ ledgerId: row.ledger_id, reason: decision.action });
          }
        }
      } catch (err) {
        if (err instanceof NoBrokerSessionError) {
          result.skipped.push({ ledgerId: row.ledger_id, reason: err.message });
        } else {
          result.errors.push({
            ledgerId: row.ledger_id,
            clientCode,
            message: err instanceof Error ? err.message : "Unknown error.",
          });
        }
      }
      await sleep(LTP_GAP_MS);
    }
  }

  return result;
}
