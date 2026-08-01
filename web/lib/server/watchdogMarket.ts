import "server-only";

import { loadBrokerSession } from "./brokerSession";
import {
  CANDLE_URL,
  LTP_URL,
  OI_BUILDUP_URL,
  OI_DATA_URL,
  PCR_URL,
  smartApiCall,
} from "./smartapi";

/**
 * Market-data reads for background jobs, authenticated with a stored session
 * instead of a request's cookie.
 *
 * Read-only by construction, not just by convention: this module imports
 * `CANDLE_URL` / `OI_DATA_URL` / `PCR_URL` / `OI_BUILDUP_URL` / `LTP_URL` and
 * nothing else from `smartapi.ts` — in particular never `PLACE_ORDER_URL`. A
 * background job authenticating with a token nobody is watching should not be
 * able to reach the one endpoint that moves real money, no matter what a
 * future change to this file adds. If a watchdog ever needs to place an
 * order, that call belongs in its own module, reviewed as the deliberate,
 * separate capability it is — not folded into this one.
 */

export class NoBrokerSessionError extends Error {
  constructor(clientCode: string) {
    super(
      `No live broker session stored for ${clientCode} — sign in (or let the session refresh) in the HUD first.`,
    );
    this.name = "NoBrokerSessionError";
  }
}

async function jwtFor(clientCode: string): Promise<string> {
  const session = await loadBrokerSession(clientCode);
  if (!session) throw new NoBrokerSessionError(clientCode);
  return session.jwtToken;
}

export interface LtpQuote {
  exchange: string;
  tradingsymbol: string;
  symboltoken: string;
}

/** `getLtpData` — the one real-time read this whole client exists to make. */
export async function watchdogLtp(clientCode: string, quote: LtpQuote) {
  return smartApiCall(LTP_URL, { method: "POST", body: quote, jwt: await jwtFor(clientCode) });
}

export async function watchdogCandles(clientCode: string, body: Record<string, unknown>) {
  return smartApiCall(CANDLE_URL, { method: "POST", body, jwt: await jwtFor(clientCode) });
}

export async function watchdogOi(clientCode: string, body: Record<string, unknown>) {
  return smartApiCall(OI_DATA_URL, { method: "POST", body, jwt: await jwtFor(clientCode) });
}

export async function watchdogPcr(clientCode: string) {
  return smartApiCall(PCR_URL, { method: "GET", jwt: await jwtFor(clientCode) });
}

export async function watchdogBuildup(clientCode: string, body: Record<string, unknown>) {
  return smartApiCall(OI_BUILDUP_URL, { method: "POST", body, jwt: await jwtFor(clientCode) });
}
