import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";

import {
  claimMobilePairing as claimPairingToken,
  createMobilePairing,
  createMobileSession,
  listMobileSessions,
  readMobileSession,
  revokeMobileSession,
  revokeMobileSessionForClient,
  touchMobileSession,
  writeLiveSignal,
} from "@/lib/supabase";

/**
 * The read-only mobile companion: pair a phone to an already-signed-in
 * desktop by QR, so it can watch signals and trades without ever seeing
 * Angel One's client code, PIN or TOTP.
 *
 * Deliberately not the same session type as the desktop's: `client_sessions`
 * (single-active-session) is about *trading* sessions — one at a time, by
 * design. A read-only phone is a different class of thing, and several can
 * be paired at once without touching that arbiter at all.
 */

export const MOBILE_SESSION_COOKIE = "dk_mobile";

export const MOBILE_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  // Long-lived on purpose: re-pairing needs the desktop screen in front of
  // you, which a phone usually isn't. Revocation (below) is the way out, not
  // a short cookie age.
  maxAge: 60 * 60 * 24 * 30,
} as const;

/** How long a QR stays scannable before the desktop has to show a fresh one. */
const PAIRING_TTL_MS = 2 * 60_000;

/** How many phones one account may keep paired at once. */
export const MAX_PAIRED_DEVICES = 3;

/**
 * Mint a QR the phone's own camera can scan directly — no in-app scanner, no
 * camera permission this app has to ask for. Rendered server-side as an SVG
 * string so nothing about QR generation ships to the browser bundle; the
 * client only ever injects markup it never had to compute.
 *
 * Near-white on near-black, not the app's usual cyan-on-zinc: a camera
 * decoding a QR needs the highest contrast it can get, and that trumps
 * matching the theme outright. The two colors are tinted just enough toward
 * the quantum palette to read as "this app's QR" rather than a stock one,
 * without giving up the contrast ratio a camera needs.
 */
export async function startMobilePairing(
  clientCode: string,
  origin: string,
): Promise<{ claimUrl: string; expiresAt: string; qrSvg: string }> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  await createMobilePairing(clientCode, token, expiresAt);

  const claimUrl = `${origin.replace(/\/$/, "")}/api/mobile/pair/claim?token=${token}`;
  const qrSvg = await QRCode.toString(claimUrl, {
    type: "svg",
    margin: 1,
    // #0b1013 / #eef9fa — near-black/near-white with a whisper of the
    // quantum cyan (#00f0ff), ~18:1 contrast, comfortably above what a
    // camera needs to decode reliably.
    color: { dark: "#0b1013", light: "#eef9fa" },
  });

  return { claimUrl, expiresAt, qrSvg };
}

export type PairingOutcome =
  | { status: "paired"; sessionId: string }
  | { status: "invalid" }
  | { status: "limit" };

/**
 * Burn the QR's token and open a new mobile session for whichever account
 * minted it — unless that account already has `MAX_PAIRED_DEVICES` phones
 * live, in which case the token is still burned (it was single-use the
 * moment it was scanned) but no session opens. The desktop's own device list
 * is where a slot actually gets freed.
 */
export async function completeMobilePairing(token: string): Promise<PairingOutcome> {
  const clientCode = await claimPairingToken(token);
  if (!clientCode) return { status: "invalid" };
  const active = await listMobileSessions(clientCode);
  if (active.length >= MAX_PAIRED_DEVICES) return { status: "limit" };
  const sessionId = randomUUID();
  await createMobileSession(clientCode, sessionId);
  return { status: "paired", sessionId };
}

export interface PairedDevice {
  sessionId: string;
  pairedAt: string;
  lastSeenAt: string;
}

/** Every phone currently paired to this account, for the desktop's own device list. */
export async function listPairedDevices(clientCode: string): Promise<PairedDevice[]> {
  const rows = await listMobileSessions(clientCode);
  return rows.map((r) => ({
    sessionId: r.session_id,
    pairedAt: r.created_at,
    lastSeenAt: r.last_seen_at,
  }));
}

/** "Remove this device" from the desktop's profile menu — frees a pairing slot. */
export async function removePairedDevice(clientCode: string, sessionId: string): Promise<boolean> {
  return revokeMobileSessionForClient(clientCode, sessionId);
}

/** The client code a paired phone's cookie is still good for, or null if it never was one. */
export async function mobileSessionClientCode(sessionId: string | undefined): Promise<string | null> {
  if (!sessionId) return null;
  return readMobileSession(sessionId);
}

/** Marks this phone as still active — see `touchMobileSession`'s own comment. */
export async function touchMobileSessionActivity(sessionId: string): Promise<void> {
  await touchMobileSession(sessionId);
}

/** "Sign out this device" from the phone itself. */
export async function signOutMobileSession(sessionId: string): Promise<void> {
  await revokeMobileSession(sessionId).catch(() => undefined);
}

/**
 * The desktop tab's throttled push of its current signal state — best-effort,
 * same as every other write in this app that a paired phone (which may not
 * exist) is the only thing that will ever read.
 */
export async function pushLiveSignal(clientCode: string, snapshot: unknown): Promise<void> {
  await writeLiveSignal(clientCode, snapshot).catch(() => undefined);
}
