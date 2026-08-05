"use client";

import {
  EXCHANGE_BSE_CM,
  EXCHANGE_BSE_FO,
  EXCHANGE_NSE_CM,
  EXCHANGE_NSE_FO,
  SMART_STREAM_URL,
} from "@/lib/engine/config";
import { type Tick, emptyTick } from "./ticks";

/**
 * `NSE_CM`/`BSE_CM` carry only this app's five index spot tokens (see
 * `trackAngelOne` in `useEngine.ts` — nothing else is ever subscribed
 * under a cash-market exchange type here), and an index has no order book
 * to fill Mode 3's depth fields with. Angel One's SmartAPI docs say indices
 * only support LTP/Quote, not SnapQuote — the same asymmetry that made
 * Dhan's feed silently drop a Full-mode index subscription (see
 * `dhanfeed.ts`'s own header comment). Both cash-market exchange types ride
 * Mode 2 (Quote) instead of Mode 3 below; NSE_FO/BSE_FO keep Mode 3 for the
 * bid/ask depth the option chain actually shows.
 */
const CM_EXCHANGE_TYPES: readonly number[] = [EXCHANGE_NSE_CM, EXCHANGE_BSE_CM];

/**
 * SmartStream 2.0 client, running **in the browser**.
 *
 * This is the piece that makes a backend-free build possible. SmartStream
 * authenticates via query string (`clientCode`, `feedToken`, `apiKey`), and a
 * browser may open a cross-origin WebSocket without a CORS preflight — so the
 * page can hold the feed itself, which no serverless function can do.
 *
 * Two consequences worth being explicit about:
 *  - The feed token reaches the client. It is a market-data credential, not the
 *    order-placing JWT, which stays server-side in the route handlers.
 *  - The feed lives for as long as the tab does. Close the tab and ticks stop.
 *
 * Binary layout (little-endian), Mode 3 "snap quote":
 *   0     u8      subscription mode
 *   1     u8      exchange type
 *   2..26 char25  token, null-padded
 *   27    i64     sequence number
 *   35    i64     exchange timestamp (epoch ms)
 *   43    i64     last traded price ×100
 *   67    i64     volume traded for the day
 *   91/99/107/115 i64  open / high / low / close ×100
 *   131   i64     open interest
 *   139   f64     open interest change %
 *   147   200B    best five: 10 × [i16 buy/sell, i64 qty, i64 price ×100, i16 orders]
 */

const PRICE_DIVISOR = 100;
const HEARTBEAT_MS = 25_000;
const MAX_TOKENS_PER_REQUEST = 1000;
const ACTION_SUBSCRIBE = 1;
const MODE_QUOTE = 2;
const MODE_SNAP_QUOTE = 3;

export function decodePacket(buf: ArrayBuffer): Tick | null {
  if (buf.byteLength < 51) return null;
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const mode = view.getUint8(0);

  let end = 2;
  while (end < 27 && bytes[end] !== 0) end += 1;
  const token = new TextDecoder()
    .decode(bytes.subarray(2, end))
    .trim();
  if (!token) return null;

  const tick = emptyTick(token);
  tick.exchangeTs = Number(view.getBigInt64(35, true));
  tick.ltp = Number(view.getBigInt64(43, true)) / PRICE_DIVISOR;

  if (mode >= 2 && buf.byteLength >= 123) {
    tick.volume = Number(view.getBigInt64(67, true));
    tick.open = Number(view.getBigInt64(91, true)) / PRICE_DIVISOR;
    tick.high = Number(view.getBigInt64(99, true)) / PRICE_DIVISOR;
    tick.low = Number(view.getBigInt64(107, true)) / PRICE_DIVISOR;
    tick.close = Number(view.getBigInt64(115, true)) / PRICE_DIVISOR;
  }

  if (mode === MODE_SNAP_QUOTE && buf.byteLength >= 379) {
    tick.oi = Number(view.getBigInt64(131, true));
    tick.oiChangePct = view.getFloat64(139, true);

    let bestBid = 0;
    let bestAsk = 0;
    for (let i = 0; i < 10; i++) {
      const off = 147 + i * 20;
      const isBuy = view.getInt16(off, true) === 1;
      const price = Number(view.getBigInt64(off + 10, true)) / PRICE_DIVISOR;
      if (price <= 0) continue;
      if (isBuy) bestBid = Math.max(bestBid, price);
      else bestAsk = bestAsk === 0 ? price : Math.min(bestAsk, price);
    }
    tick.bestBid = bestBid;
    tick.bestAsk = bestAsk;
  }

  return tick;
}

export interface StreamCredentials {
  clientCode: string;
  feedToken: string;
  apiKey: string;
}

export type StreamStatus = "idle" | "connecting" | "live" | "reconnecting" | "error";

export class SmartStreamClient {
  private ws: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private stopped = false;
  private tracked: Record<number, Set<string>> = {
    [EXCHANGE_NSE_CM]: new Set(),
    [EXCHANGE_NSE_FO]: new Set(),
    [EXCHANGE_BSE_CM]: new Set(),
    [EXCHANGE_BSE_FO]: new Set(),
  };

  status: StreamStatus = "idle";
  lastError: string | null = null;
  reconnects = 0;

  constructor(
    private onTick: (tick: Tick) => void,
    private onStatus?: (status: StreamStatus) => void,
  ) {}

  private setStatus(s: StreamStatus) {
    this.status = s;
    this.onStatus?.(s);
  }

  get trackedCount(): number {
    return Object.values(this.tracked).reduce((a, s) => a + s.size, 0);
  }

  start(creds: StreamCredentials): void {
    this.stop();
    this.stopped = false;
    this.retries = 0;
    this.connect(creds);
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.retryTimer = null;
    this.heartbeat = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* already closing */
      }
      this.ws = null;
    }
    this.setStatus("idle");
  }

  /** Add tokens to the tracked set; returns only the ones that were new. */
  track(exchangeType: number, tokens: string[]): string[] {
    const set = (this.tracked[exchangeType] ??= new Set());
    const fresh = tokens.filter((t) => t && !set.has(t));
    for (const t of fresh) set.add(t);
    return fresh;
  }

  /**
   * Subscribe a delta (or the whole tracked set) — Mode 3 snap quote for
   * everything except the cash-market exchange types, which ride Mode 2
   * (see the file header comment).
   *
   * The default source is *every* tracked exchange type, built generically
   * from `this.tracked` rather than hardcoding the two NSE ones — this fires
   * on every reconnect (see `ws.onopen` below), so a hardcoded default would
   * silently drop any other exchange type's tokens the instant the socket
   * ever reconnected.
   */
  subscribe(only?: Record<number, string[]>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const source: Record<number, string[]> =
      only ??
      Object.fromEntries(
        Object.entries(this.tracked).map(([exch, set]) => [exch, [...set]]),
      );

    const snapTokenList: { exchangeType: number; tokens: string[] }[] = [];
    const quoteTokenList: { exchangeType: number; tokens: string[] }[] = [];
    for (const [exch, tokens] of Object.entries(source)) {
      const exchangeType = Number(exch);
      const list = CM_EXCHANGE_TYPES.includes(exchangeType) ? quoteTokenList : snapTokenList;
      for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_REQUEST) {
        const slice = tokens.slice(i, i + MAX_TOKENS_PER_REQUEST);
        if (slice.length) list.push({ exchangeType, tokens: slice });
      }
    }

    this.sendSubscribe(MODE_SNAP_QUOTE, snapTokenList);
    this.sendSubscribe(MODE_QUOTE, quoteTokenList);
  }

  private sendSubscribe(
    mode: number,
    tokenList: { exchangeType: number; tokens: string[] }[],
  ): void {
    if (!tokenList.length || !this.ws) return;
    this.ws.send(
      JSON.stringify({
        correlationID: `deltak-${Date.now()}`,
        action: ACTION_SUBSCRIBE,
        params: { mode, tokenList },
      }),
    );
  }

  subscribeNew(exchangeType: number, tokens: string[]): void {
    const fresh = this.track(exchangeType, tokens);
    if (fresh.length) this.subscribe({ [exchangeType]: fresh });
  }

  private connect(creds: StreamCredentials): void {
    if (this.stopped) return;
    this.setStatus(this.retries ? "reconnecting" : "connecting");

    const url =
      `${SMART_STREAM_URL}?clientCode=${encodeURIComponent(creds.clientCode)}` +
      `&feedToken=${encodeURIComponent(creds.feedToken)}` +
      `&apiKey=${encodeURIComponent(creds.apiKey)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : "WebSocket failed to open";
      this.scheduleRetry(creds);
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.lastError = null;
      this.setStatus("live");
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, HEARTBEAT_MS);
      this.subscribe();
    };

    ws.onmessage = (event) => {
      // Text frames are the "pong" heartbeat echo.
      if (typeof event.data === "string") return;
      const tick = decodePacket(event.data as ArrayBuffer);
      if (tick) this.onTick(tick);
    };

    ws.onerror = () => {
      this.lastError = "SmartStream socket error";
    };

    ws.onclose = (event) => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.ws = null;
      if (this.stopped) return;
      this.lastError = `SmartStream closed (${event.code})`;
      this.scheduleRetry(creds);
    };
  }

  private scheduleRetry(creds: StreamCredentials): void {
    if (this.stopped) return;
    this.retries += 1;
    this.reconnects += 1;
    if (this.retries > 8) {
      this.setStatus("error");
      return;
    }
    this.setStatus("reconnecting");
    const delay = Math.min(1000 * 2 ** (this.retries - 1), 30_000);
    this.retryTimer = setTimeout(() => this.connect(creds), delay);
  }
}
