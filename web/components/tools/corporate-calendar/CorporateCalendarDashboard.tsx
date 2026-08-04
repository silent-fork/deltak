"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelBootOverlay } from "@/components/PanelBootOverlay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolFooterMark } from "@/components/tools/ToolPageShell";
import { track } from "@/lib/analytics";
import type { CorporateCalendarResponse } from "@/lib/tools/corporateCalendarTypes";
import { timeAgo } from "@/lib/utils";

import { BlockDealsTicker } from "./BlockDealsTicker";
import { EventTimeline } from "./EventTimeline";
import { IpoCards } from "./IpoCards";

const AUTO_REFRESH_MS = 15 * 60_000;

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CorporateCalendarResponse; fetchedAt: string };

const SOURCE_NOTE = "Sourced from NSE corporate, IPO & block-deal data";

export function CorporateCalendarDashboard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/tools/corporate-calendar", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? "Corporate calendar fetch failed.");
      setState({ status: "ready", data: body, fetchedAt: new Date().toISOString() });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Corporate calendar fetch failed.",
      });
      track("tool_fetch_error", { tool: "corporate_calendar" });
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Card className="min-h-0 shrink-0">
          <CardHeader>
            <CardTitle>This Week</CardTitle>
          </CardHeader>
          {/* A real week's worth of results/actions/IPO rows runs well past 200px
              once it's actually on screen (measured ~700px+ on a dense week) —
              sized closer to that so the panel doesn't visibly grow the moment
              data lands. */}
          <CardContent className="relative min-h-[260px] lg:min-h-[480px]">
            <PanelBootOverlay label="event calendar" />
          </CardContent>
        </Card>
        <Card className="min-h-0 shrink-0">
          <CardHeader>
            <CardTitle>Block Deals</CardTitle>
          </CardHeader>
          {/* One row of chips is genuinely this short — matching it (rather than
              the old 80px) avoids a visible shrink on load. */}
          <CardContent className="relative min-h-[48px]">
            <PanelBootOverlay label="block deals" compact />
          </CardContent>
        </Card>
        <Card className="min-h-0 shrink-0">
          <CardHeader>
            <CardTitle>Recent IPOs</CardTitle>
          </CardHeader>
          <CardContent className="relative min-h-[180px]">
            <PanelBootOverlay label="recent IPOs" />
          </CardContent>
        </Card>

        <ToolFooterMark sourceNote={SOURCE_NOTE} />
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
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          NSE corporate &amp; IPO data · data {timeAgo(fetchedAt)}
        </span>
        <button
          onClick={() => {
            track("tool_refresh", { tool: "corporate_calendar" });
            void load();
          }}
          className="rounded border border-zinc-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500 hover:border-quantum/50 hover:text-quantum"
        >
          Refresh
        </button>
      </div>

      <EventTimeline events={data.events} />
      <BlockDealsTicker deals={data.blockDeals} />
      <IpoCards ipos={data.recentIpos} />

      <ToolFooterMark sourceNote={SOURCE_NOTE} />
    </div>
  );
}
