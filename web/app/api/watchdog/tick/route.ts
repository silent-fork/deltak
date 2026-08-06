import { NextResponse } from "next/server";

import { isCronAuthorised } from "@/lib/server/cronAuth";
import { runWatchdogTick } from "@/lib/server/watchdogGuards";

/**
 * `GET /api/watchdog/tick` — the risk guard that runs with no browser tab
 * open.
 *
 * Invoked once a minute by Supabase's own `pg_cron` + `pg_net` (the
 * `watchdog-tick` job, `select net.http_get(...)` against this route with an
 * `Authorization: Bearer` header pulled from `vault.decrypted_secrets` at
 * fire time) — there is no Vercel Cron entry for this; `CRON_SECRET` here is
 * just this route's own bearer-token convention, matched against whatever
 * that vault secret holds, so nobody else can trigger it. Paper positions
 * only: it enforces stop/target and the 3:15 PM IST Daylight Rest flatten
 * against every account's open paper book, using each account's own stored
 * (encrypted) session to read a live price. See `watchdogGuards.ts` for what
 * this does and does not cover yet.
 *
 * Always 200 with a summary body, even when nothing fired — a cron dashboard
 * reading a non-200 as "the schedule is broken" should not confuse "ran and
 * found nothing to do" with "failed to run".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorised(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ detail: "Not authorised." }, { status: 401 });
  }

  try {
    const result = await runWatchdogTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, detail: err instanceof Error ? err.message : "Watchdog tick failed." },
      { status: 500 },
    );
  }
}
