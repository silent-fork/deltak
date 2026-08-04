"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelBootOverlay } from "@/components/PanelBootOverlay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolFooterMark } from "@/components/tools/ToolPageShell";
import { track } from "@/lib/analytics";
import type { MarketScannerResponse } from "@/lib/tools/marketScannerTypes";
import { timeAgo } from "@/lib/utils";

import { RangeRadar } from "./RangeRadar";
import { SectorTreemap } from "./SectorTreemap";

const AUTO_REFRESH_MS = 20 * 60_000;

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: MarketScannerResponse; fetchedAt: string };

export function MarketScannerDashboard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/tools/market-scanner", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? "Market scanner fetch failed.");
      setState({ status: "ready", data: body, fetchedAt: new Date().toISOString() });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Market scanner fetch failed.",
      });
      track("tool_fetch_error", { tool: "market_scanner" });
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
        <div className="grid min-h-0 grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-[1.6fr_1fr]">
          <Card className="min-h-0 border-quantum/20">
            <CardHeader>
              <CardTitle className="text-quantum">Sector Heatmap</CardTitle>
            </CardHeader>
            <CardContent className="relative min-h-[320px] flex-1">
              <PanelBootOverlay label="sector heatmap" />
            </CardContent>
          </Card>
          <Card className="min-h-0">
            <CardHeader>
              <CardTitle>Range Radar</CardTitle>
            </CardHeader>
            <CardContent className="relative min-h-[260px] flex-1">
              <PanelBootOverlay label="range radar" />
            </CardContent>
          </Card>
        </div>

        <ToolFooterMark sourceNote="Sourced from NSE equity bhavcopy & niftyindices.com" />
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
          EOD bhavcopy · data {timeAgo(fetchedAt)}
        </span>
        <button
          onClick={() => {
            track("tool_refresh", { tool: "market_scanner" });
            void load();
          }}
          className="rounded border border-zinc-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500 hover:border-quantum/50 hover:text-quantum"
        >
          Refresh
        </button>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-[1.6fr_1fr]">
        <SectorTreemap sectors={data.sectors} />
        <RangeRadar stocks={data.radar} />
      </div>

      <ToolFooterMark sourceNote="Sourced from NSE equity bhavcopy & niftyindices.com" />
    </div>
  );
}
