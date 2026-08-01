import { NextResponse } from "next/server";

import { isCronAuthorised } from "@/lib/server/cronAuth";
import { runWatchdogTick } from "@/lib/server/watchdogGuards";

/**
 * `GET /api/watchdog/tick` — the risk guard that runs with no browser tab
 * open.
 *
 * Invoked once a minute by Vercel Cron (`vercel.json`), authenticated by the
 * `Authorization: Bearer $CRON_SECRET` header Vercel attaches automatically
 * when that env var is set — nobody else can trigger this route. Paper
 * positions only: it enforces stop/target and the 3:15 PM IST Daylight Rest
 * flatten against every account's open paper book, using each account's own
 * stored (encrypted) session to read a live price. See `watchdogGuards.ts`
 * for what this does and does not cover yet.
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
