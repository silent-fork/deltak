"use client";

import { type Tick, emptyTick } from "./ticks";

/**
 * Dhan Live Market Feed WebSocket client, running **in the browser** — the
 * Dhan counterpart to `smartstream.ts`.
 *
 * Same accepted tradeoff as Angel One's `SmartStreamClient`: the browser
 * opens this socket itself (`wss://api-feed.dhan.co`, authenticated via
 * query string), so the credential it authenticates with has to reach the
 * page. Unlike Angel One's scoped `feedToken`, Dhan issues no separate
 * feed-only credential — the same `accessToken` that can place orders opens
 * this socket. See `lib/server/session.ts` for why that is accepted rather
 * than routed through a server-side relay.
 *
 * Binary layout (little-endian), Full Packet (response code 8):
 *   0-7    header: code(1) · msgLen i16(2) · exchSeg(1) · securityId i32(4)
 *   8-11   f32   LTP
 *   12-13  i16   last traded qty
 *   14-17  i32   last trade time (epoch)
 *   18-21  f32   average trade price
 *   22-25  i32   volume
 *   26-29  i32   total sell qty
 *   30-33  i32   total buy qty
 *   34-37  i32   open interest
 *   38-41  i32   OI day high (NSE_FNO only)
 *   42-45  i32   OI day low
 *   46-49  f32   day open
 *   50-53  f32   day close (post-close only)
 *   54-57  f32   day high
 *   58-61  f32   day low
 *   62-161 5 × [bidQty i32(4), askQty i32(4), bidOrders i16(2),
 *               askOrders i16(2), bidPrice f32(4), askPrice f32(4)]
 *
 * Dhan sends open interest but not its *change* — Angel One computes that
 * server-side and puts it straight in the tick. Here it is derived from the
 * "Prev Close" packet (response code 6), which every subscription triggers
 * once and which carries the previous session's closing OI.
 *
 * Indices (`IDX_I`) never got a single Full-mode packet in testing against
 * Dhan's real feed — confirmed empirically, not just from the docs: a
 * Full-mode subscribe for NIFTY's index security produced zero packets in
 * 15s. An index has no market depth to fill a Full packet with, so Dhan's
 * feed appears to silently drop the subscription rather than answer it.
 *
 * Quote mode (response code 4, layout below) does work for indices —
 * confirmed the same way, real LTP/open/close streaming immediately — and
 * unlike Ticker mode (response code 2, LTP + timestamp only) it still
 * carries `close`, which `change`/`change%` are computed from downstream.
 * Every index spot token rides Quote mode instead of Full — see
 * `subscribe()`.
 *
 * Binary layout (little-endian), Quote Packet (response code 4):
 *   0-7    header: code(1) · msgLen i16(2) · exchSeg(1) · securityId i32(4)
 *   8-11   f32   LTP
 *   12-13  i16   last traded qty
 *   14-17  i32   last trade time (epoch)
 *   18-21  f32   average trade price
 *   22-25  i32   volume
 *   26-29  i32   total sell qty
 *   30-33  i32   total buy qty
 *   34-37  f32   day open
 *   38-41  f32   day close
 *   42-45  f32   day high
 *   46-49  f32   day low
 */

const FEED_URL = "wss://api-feed.dhan.co";
const HEARTBEAT_MS = 8_000; // server pings every 10s; a stale ack after 40s drops the connection
const MAX_INSTRUMENTS_PER_MESSAGE = 100;

/** Indices ride this — see the file header comment for why. */
const REQUEST_SUBSCRIBE_QUOTE = 17;
const REQUEST_SUBSCRIBE_FULL = 21;
/** The one segment that has to subscribe in Quote mode, not Full. */
const QUOTE_ONLY_SEGMENT: DhanSegment = "IDX_I";
const RESPONSE_TICKER = 2;
const RESPONSE_QUOTE = 4;
const RESPONSE_OI = 5;
const RESPONSE_PREV_CLOSE = 6;
const RESPONSE_FULL = 8;
const RESPONSE_DISCONNECT = 50;

/** Dhan's own exchange-segment vocabulary for the WebSocket subscribe JSON and the REST Data API alike. */
export type DhanSegment = "IDX_I" | "NSE_EQ" | "NSE_FNO" | "BSE_EQ" | "BSE_FNO" | "MCX_COMM";

export function decodeDhanPacket(buf: ArrayBuffer, prevOi: Map<string, number>): Tick | null {
  if (buf.byteLength < 8) return null;
  const view = new DataView(buf);
  const responseCode = view.getUint8(0);
  const securityId = String(view.getInt32(4, true));
  if (!securityId) return null;

  if (responseCode === RESPONSE_PREV_CLOSE) {
    if (buf.byteLength >= 16) {
      const prevDayOi = view.getInt32(12, true);
      if (prevDayOi > 0) prevOi.set(securityId, prevDayOi);
    }
    return null;
  }
  if (responseCode === RESPONSE_DISCONNECT) return null;

  const tick = emptyTick(securityId);
  const withOiChange = (oi: number) => {
    tick.oi = oi;
    const prev = prevOi.get(securityId);
    tick.oiChangePct = prev ? Number((((oi - prev) / prev) * 100).toFixed(2)) : 0;
  };

  if (responseCode === RESPONSE_TICKER) {
    if (buf.byteLength < 16) return null;
    tick.ltp = view.getFloat32(8, true);
    tick.exchangeTs = view.getInt32(12, true);
    return tick;
  }

  if (responseCode === RESPONSE_QUOTE) {
    if (buf.byteLength < 50) return null;
    tick.ltp = view.getFloat32(8, true);
    tick.exchangeTs = view.getInt32(14, true);
    tick.volume = view.getInt32(22, true);
    tick.open = view.getFloat32(34, true);
    tick.close = view.getFloat32(38, true);
    tick.high = view.getFloat32(42, true);
    tick.low = view.getFloat32(46, true);
    return tick;
  }

  if (responseCode === RESPONSE_OI) {
    if (buf.byteLength < 12) return null;
    withOiChange(view.getInt32(8, true));
    return tick;
  }

  if (responseCode === RESPONSE_FULL) {
    if (buf.byteLength < 62) return null;
    tick.ltp = view.getFloat32(8, true);
    tick.exchangeTs = view.getInt32(14, true);
    tick.volume = view.getInt32(22, true);
    withOiChange(view.getInt32(34, true));
    tick.open = view.getFloat32(46, true);
    tick.close = view.getFloat32(50, true);
    tick.high = view.getFloat32(54, true);
    tick.low = view.getFloat32(58, true);

    if (buf.byteLength >= 162) {
      let bestBid = 0;
      let bestAsk = 0;
      for (let i = 0; i < 5; i++) {
        const off = 62 + i * 20;
        const bidPrice = view.getFloat32(off + 12, true);
        const askPrice = view.getFloat32(off + 16, true);
        if (bidPrice > 0) bestBid = Math.max(bestBid, bidPrice);
        if (askPrice > 0) bestAsk = bestAsk === 0 ? askPrice : Math.min(bestAsk, askPrice);
      }
      tick.bestBid = bestBid;
      tick.bestAsk = bestAsk;
    }
    return tick;
  }

  return null;
}

export interface DhanFeedCredentials {
  clientId: string;
  accessToken: string;
}

export type StreamStatus = "idle" | "connecting" | "live" | "reconnecting" | "error";

export class DhanFeedClient {
  private ws: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private stopped = false;
  private tracked: Partial<Record<DhanSegment, Set<string>>> = {};
  private prevOi = new Map<string, number>();

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
    return Object.values(this.tracked).reduce((a, s) => a + (s?.size ?? 0), 0);
  }

  start(creds: DhanFeedCredentials): void {
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
  track(segment: DhanSegment, tokens: string[]): string[] {
    const set = (this.tracked[segment] ??= new Set());
    const fresh = tokens.filter((t) => t && !set.has(t));
    for (const t of fresh) set.add(t);
    return fresh;
  }

  /**
   * Subscribe a delta (or the whole tracked set) — Full mode for everything
   * except `QUOTE_ONLY_SEGMENT`, which rides Quote mode instead (see the
   * file header comment). Two separate request batches, not one mixed-mode
   * message: Dhan's subscribe frame carries a single `RequestCode` for the
   * whole `InstrumentList`, so a spot token and an option token can't share
   * one message if they need different modes.
   */
  subscribe(only?: Partial<Record<DhanSegment, string[]>>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const source: Partial<Record<DhanSegment, string[]>> =
      only ??
      Object.fromEntries(
        Object.entries(this.tracked).map(([seg, set]) => [seg, [...(set ?? [])]]),
      );

    const fullInstruments: { ExchangeSegment: DhanSegment; SecurityId: string }[] = [];
    const quoteInstruments: { ExchangeSegment: DhanSegment; SecurityId: string }[] = [];
    for (const [segment, tokens] of Object.entries(source) as [DhanSegment, string[]][]) {
      const bucket = segment === QUOTE_ONLY_SEGMENT ? quoteInstruments : fullInstruments;
      for (const token of tokens) bucket.push({ ExchangeSegment: segment, SecurityId: token });
    }

    this.sendSubscribe(REQUEST_SUBSCRIBE_FULL, fullInstruments);
    this.sendSubscribe(REQUEST_SUBSCRIBE_QUOTE, quoteInstruments);
  }

  private sendSubscribe(
    requestCode: number,
    instruments: { ExchangeSegment: DhanSegment; SecurityId: string }[],
  ): void {
    if (!instruments.length || !this.ws) return;
    for (let i = 0; i < instruments.length; i += MAX_INSTRUMENTS_PER_MESSAGE) {
      const slice = instruments.slice(i, i + MAX_INSTRUMENTS_PER_MESSAGE);
      this.ws.send(
        JSON.stringify({
          RequestCode: requestCode,
          InstrumentCount: slice.length,
          InstrumentList: slice,
        }),
      );
    }
  }

  subscribeNew(segment: DhanSegment, tokens: string[]): void {
    const fresh = this.track(segment, tokens);
    if (fresh.length) this.subscribe({ [segment]: fresh });
  }

  private connect(creds: DhanFeedCredentials): void {
    if (this.stopped) return;
    this.setStatus(this.retries ? "reconnecting" : "connecting");

    const url =
      `${FEED_URL}?version=2&token=${encodeURIComponent(creds.accessToken)}` +
      `&clientId=${encodeURIComponent(creds.clientId)}&authType=2`;

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
      // The server pings every 10s over the same connection; no client-sent
      // heartbeat is documented, so this is purely a liveness nudge in case
      // an intermediary silently drops an idle connection before the
      // server's own 40s timeout would.
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ RequestCode: 11 }));
      }, HEARTBEAT_MS);
      this.subscribe();
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") return;
      const tick = decodeDhanPacket(event.data as ArrayBuffer, this.prevOi);
      if (tick) this.onTick(tick);
    };

    ws.onerror = () => {
      this.lastError = "Dhan feed socket error";
    };

    ws.onclose = (event) => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.ws = null;
      if (this.stopped) return;
      this.lastError = `Dhan feed closed (${event.code})`;
      this.scheduleRetry(creds);
    };
  }

  private scheduleRetry(creds: DhanFeedCredentials): void {
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
