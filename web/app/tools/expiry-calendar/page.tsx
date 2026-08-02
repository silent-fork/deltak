import { ArrowRight, CalendarDays, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaLink } from "@/components/CtaLink";
import { Wordmark } from "@/components/Wordmark";
import { INDEX_UNIVERSE } from "@/lib/engine/config";
import { getExpiryCalendar, type ExpiryEntry } from "@/lib/server/expiryCalendar";

/**
 * A free, no-login tool: upcoming weekly/monthly expiry dates for NIFTY,
 * BANKNIFTY and FINNIFTY options, read from Angel One's public scrip
 * master — the same file `/api/master` downloads for the signed-in
 * terminal, just without needing a broker session to see it. Existing
 * purely to be a real, useful, indexable page in its own right: something
 * worth linking to and ranking for on its own, not a funnel dressed up as
 * content.
 */

export const revalidate = 3600;
export const runtime = "nodejs";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "NIFTY, BANKNIFTY & FINNIFTY Options Expiry Calendar",
  description:
    "Upcoming weekly and monthly expiry dates for NIFTY, BANKNIFTY and FINNIFTY options, read straight off Angel One's public scrip master. Free, no broker login.",
  keywords: [
    "nifty expiry calendar",
    "banknifty expiry date",
    "finnifty expiry calendar",
    "nifty weekly expiry",
    "options expiry calendar india",
    "nifty expiry day",
  ],
  alternates: {
    canonical: "/tools/expiry-calendar",
  },
};

const LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(INDEX_UNIVERSE).map(([k, v]) => [k, v.label]),
);

function ExpiryTable({
  underlying,
  entries,
}: {
  underlying: string;
  entries: ExpiryEntry[];
}) {
  return (
    <div className="dk-panel rounded-lg p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-zinc-100">
          {LABELS[underlying] ?? underlying}
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          {underlying}
        </span>
      </div>
      {entries.length ? (
        <table className="mt-3 w-full text-left text-[12px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-zinc-600">
              <th className="pb-1.5 font-medium">Date</th>
              <th className="pb-1.5 font-medium">Day</th>
              <th className="pb-1.5 font-medium">Type</th>
              <th className="pb-1.5 text-right font-medium">In</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.date} className="border-t border-zinc-800/70">
                <td className="py-1.5 font-mono text-zinc-200">{e.date}</td>
                <td className="py-1.5 text-zinc-500">{e.weekday}</td>
                <td className="py-1.5">
                  <span
                    className={
                      e.kind === "Monthly"
                        ? "rounded border border-quantum/40 bg-quantum/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-quantum"
                        : "rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500"
                    }
                  >
                    {e.kind}
                  </span>
                </td>
                <td className="py-1.5 text-right font-mono text-zinc-400">
                  {e.daysToExpiry === 0 ? "Today" : `${e.daysToExpiry}d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-[12px] text-zinc-500">
          No upcoming expiries found in the scrip master right now.
        </p>
      )}
    </div>
  );
}

export default async function ExpiryCalendarPage() {
  let calendar: Awaited<ReturnType<typeof getExpiryCalendar>> | null = null;
  let error: string | null = null;
  try {
    calendar = await getExpiryCalendar();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the scrip master.";
  }

  return (
    <main className="dk-grid-bg relative min-h-dvh overflow-hidden bg-zinc-950">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.07] blur-[140px]"
      />

      <header className="relative mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
            <Zap className="h-4 w-4 text-quantum" />
          </div>
          <Wordmark className="text-[15px] tracking-[0.18em]" />
        </Link>
        <CtaLink
          href="/terminal"
          location="tools-expiry-calendar-nav"
          className="flex h-9 items-center gap-1.5 rounded-md border border-quantum/50 bg-quantum/10 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/20"
        >
          Terminal
          <ArrowRight className="h-3.5 w-3.5" />
        </CtaLink>
      </header>

      <section className="relative mx-auto max-w-4xl px-5 pb-4 pt-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          <CalendarDays className="h-3 w-3" />
          Free tool · no sign-in
        </span>
        <h1 className="mt-4 text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          NIFTY, BANKNIFTY &amp; FINNIFTY options expiry calendar
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
          Read straight off Angel One&apos;s public scrip master — the
          exchange&apos;s own contract list — instead of a hand-kept
          calendar, so a holiday shift or a change to which weekday carries
          the monthly expiry shows up here the day it takes effect, not
          whenever someone remembers to update a page.
        </p>
      </section>

      <section className="relative mx-auto max-w-4xl px-5 pb-16">
        {error ? (
          <div className="dk-panel rounded-lg border border-rose-500/30 p-4 text-[12.5px] text-rose-300">
            {error} — try again shortly.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Object.keys(INDEX_UNIVERSE).map((u) => (
              <ExpiryTable key={u} underlying={u} entries={calendar?.underlyings[u] ?? []} />
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-[10.5px] leading-relaxed text-zinc-600">
          {calendar
            ? `Generated ${new Date(calendar.generatedAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "medium",
                timeStyle: "short",
              })} IST`
            : "—"}{" "}
          · refreshed hourly from Angel One&apos;s scrip master.
        </p>
      </section>

      <section className="relative mx-auto max-w-3xl px-5 pb-16 text-center">
        <div className="dk-panel rounded-xl px-6 py-8">
          <h2 className="text-lg font-bold text-zinc-50">
            Trade the wall migration around these expiries
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-zinc-500">
            DeltaK reads COA support/resistance walls and RRG rotation live
            across all three indices — sign in with your own Angel One
            account and watch it work in Paper mode.
          </p>
          <CtaLink
            href="/terminal"
            location="tools-expiry-calendar-closing"
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-quantum/60 bg-quantum/15 px-6 text-[12.5px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25"
          >
            Terminal
            <ArrowRight className="h-4 w-4" />
          </CtaLink>
        </div>
      </section>

      <footer className="relative mx-auto max-w-4xl px-5 pb-8 text-center text-[10px] leading-relaxed text-zinc-600">
        <p>Not investment advice. Options trading carries substantial risk of loss.</p>
      </footer>
    </main>
  );
}
