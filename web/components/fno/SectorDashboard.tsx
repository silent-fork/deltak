"use client";

import { AlertTriangle, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelBootOverlay } from "@/components/PanelBootOverlay";
import type { SectorRotationApiResponse } from "@/lib/sectors/types";

import { MarketPulse } from "./MarketPulse";
import { SectorLeaderboard } from "./SectorLeaderboard";
import { SectorRrgChart } from "./SectorRrgChart";
import { TopPicks } from "./TopPicks";

/** Backfilled from NSE's own bhavcopy — nothing to gain re-asking inside this window. */
const AUTO_REFRESH_MS = 15 * 60_000;

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: SectorRotationApiResponse; fetchedAt: string };

/**
 * The public F&O sector-rotation dashboard's client shell — no-login,
 * sourced entirely from `/api/fno/sector-rotation` (NSE bhavcopy +
 * niftyindices.com constituents + F&O lots, never Angel One).
 *
 * Mobile-first: the RRG chart, the dashboard's focal component per the
 * user's own instruction, stacks full-width above the leaderboard on a
 * narrow viewport and moves beside it once there is room (`lg:` grid
 * below) — no separate mobile layout to keep in sync, one responsive one.
 */
export function SectorDashboard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const res = await fetch("/api/fno/sector-rotation", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? "Sector rotation fetch failed.");
      setState({ status: "ready", data: body, fetchedAt: new Date().toISOString() });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Sector rotation fetch failed.",
      });
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount + poll, same shape as the rest of the codebase's data
    // effects (e.g. the snapshot hydration effect in `useMarketData.ts`),
    // which the project's eslint config already doesn't hold to the
    // stricter react-compiler `set-state-in-effect` rule either.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "loading") {
    return (
      <div className="relative min-h-[70vh] rounded-lg border border-zinc-800/70 bg-zinc-900/30">
        <PanelBootOverlay label="sector rotation" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.03] p-6 text-center">
        <AlertTriangle className="h-6 w-6 text-rose-400" />
        <p className="max-w-md font-mono text-xs text-rose-300">{state.message}</p>
        <button
          onClick={load}
          className="rounded border border-zinc-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-300 hover:border-quantum/50 hover:text-quantum"
        >
          Retry
        </button>
      </div>
    );
  }

  const { data, fetchedAt } = state;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <MarketPulse
        benchmarkLabel={data.benchmark.label}
        benchmarkClose={data.benchmark.close}
        benchmarkChangePct={data.benchmark.changePct}
        asOf={data.asOf}
        fetchedAt={fetchedAt}
        loading={refreshing}
        onRefresh={load}
      />

      {/*
        The hero row: RRG dominates on every viewport (full-width on mobile,
        ~2/3 width once `lg:` has room), leaderboard rides alongside rather
        than below it once the viewport allows — never the other way round.
        `lg:flex-1 lg:min-h-0` lets this row grow to fill whatever vertical
        space the page's `lg:h-dvh` shell (see `app/fno/page.tsx`) leaves
        after the header, pulse strip and picks section — both panels then
        stretch to the same height (CSS Grid's default `align-items:
        stretch`) instead of the leaderboard ending short with dead space
        below it, and shrink the same way on a shorter screen since each
        panel scrolls its own overflow internally.
      */}
      <div className="grid min-h-0 grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SectorRrgChart
          sectors={data.sectors}
          asOf={data.asOf}
          benchmarkLabel={data.benchmark.label}
        />
        <SectorLeaderboard sectors={data.sectors} />
      </div>

      <TopPicks entries={data.picks} />

      <div className="flex shrink-0 items-center justify-center gap-1.5 py-2 font-mono text-[9px] uppercase tracking-wider text-zinc-700">
        <Zap className="h-2.5 w-2.5" />
        Sourced from NSE bhavcopy &amp; niftyindices.com — independent of Angel One
      </div>
    </div>
  );
}
