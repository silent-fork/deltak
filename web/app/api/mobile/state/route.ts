import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { DEFAULT_CONFIG } from "@/lib/engine/config";
import type { Position } from "@/lib/types";
import { MOBILE_SESSION_COOKIE, mobileSessionClientCode } from "@/lib/server/mobile";
import { readLiveSignal, readProfile, selectFrom, supabaseConfigured } from "@/lib/supabase";

/**
 * `GET /api/mobile/state` — everything the read-only companion shows.
 *
 * Never imports `lib/server/smartapi.ts`: this route cannot call Angel One
 * even by accident, because nothing here holds a JWT to call it with. A
 * paired phone reads exactly three things, all already scoped to this
 * account's client code — the desktop's last pushed signal snapshot, its
 * recent positions (open and closed both; the client separates them), and the
 * paper wallet's own DB checkpoint.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rebuild the wallet card from the same DB checkpoint the desktop restores
 * from on login (`readProfile` → `Ledger.restoreWallet`), so the companion
 * has a real number the moment it's paired instead of "waiting for the
 * desktop" until a live push happens to land — the same fallback `positions`
 * already gets, applied to the wallet card too.
 */
function walletFromCheckpoint(
  profile: Awaited<ReturnType<typeof readProfile>>,
  positions: Position[],
) {
  const capital = profile?.paper_capital ?? DEFAULT_CONFIG.paperCapital;
  const charges = profile?.paper_charges ?? 0;
  const realised_pnl = profile?.paper_realised_pnl ?? 0;
  const open = positions.filter((p) => p.status === "OPEN");
  const open_pnl = open.reduce((a, p) => a + p.unrealised_pnl, 0);
  const deployed_margin = open.reduce((a, p) => a + p.avg_price * p.quantity, 0);

  return {
    capital,
    equity: capital + open_pnl,
    deployed_margin,
    charges,
    open_pnl,
    realised_pnl,
    total_pnl: realised_pnl + open_pnl,
  };
}

export async function GET() {
  if (!supabaseConfigured) {
    return NextResponse.json({ detail: "Persistence is not configured." }, { status: 503 });
  }

  const sessionId = (await cookies()).get(MOBILE_SESSION_COOKIE)?.value;
  const clientCode = await mobileSessionClientCode(sessionId);
  if (!clientCode) {
    return NextResponse.json({ detail: "This phone isn't paired." }, { status: 401 });
  }

  const [signalRow, positions, profile] = await Promise.all([
    readLiveSignal(clientCode),
    selectFrom("positions", { client_code: `eq.${clientCode}`, limit: "50" }).catch(() => []),
    readProfile(clientCode).catch(() => null),
  ]);

  return NextResponse.json({
    client_code: clientCode,
    signal: signalRow?.snapshot ?? null,
    signal_updated_at: signalRow?.updated_at ?? null,
    positions,
    wallet: walletFromCheckpoint(profile, positions as Position[]),
  });
}
