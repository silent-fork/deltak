"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelBootOverlay } from "@/components/PanelBootOverlay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolFooterMark } from "@/components/tools/ToolPageShell";
import { track } from "@/lib/analytics";
import type { VolatilityDeskResponse } from "@/lib/tools/volatilityDeskTypes";
import { timeAgo } from "@/lib/utils";

import { MaxPainSkyline } from "./MaxPainSkyline";
import { OiCompass } from "./OiCompass";
import { PcrDials } from "./PcrDial";
import { VixStrip } from "./VixStrip";

const AUTO_REFRESH_MS = 15 * 60_000;

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: VolatilityDeskResponse; fetchedAt: string };

export function VolatilityDeskDashboard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/tools/volatility-desk", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? "Volatility desk fetch failed.");
      setState({ status: "ready", data: body, fetchedAt: new Date().toISOString() });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Volatility desk fetch failed.",
      });
      track("tool_fetch_error", { tool: "volatility_desk" });
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
        <div className="grid min-h-0 grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-[1.3fr_1fr]">
          <Card className="min-h-0 border-quantum/20">
            <CardHeader>
              <CardTitle className="text-quantum">OI Buildup Compass</CardTitle>
            </CardHeader>
            <CardContent className="relative min-h-[280px] flex-1">
              <PanelBootOverlay label="OI compass" />
            </CardContent>
          </Card>
          <Card className="min-h-0">
            <CardHeader>
              <CardTitle>India VIX</CardTitle>
            </CardHeader>
            <CardContent className="relative min-h-[160px]">
              <PanelBootOverlay label="VIX" />
            </CardContent>
          </Card>
        </div>
        <Card className="min-h-0 shrink-0">
          <CardHeader>
            <CardTitle>Max Pain Skyline</CardTitle>
          </CardHeader>
          <CardContent className="relative min-h-[180px]">
            <PanelBootOverlay label="max pain" />
          </CardContent>
        </Card>

        <ToolFooterMark sourceNote="Sourced from NSE F&O bhavcopy, option chain & VIX history" />
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
          NSE F&amp;O bhavcopy &amp; option chain · data {timeAgo(fetchedAt)}
        </span>
        <button
          onClick={() => {
            track("tool_refresh", { tool: "volatility_desk" });
            void load();
          }}
          className="rounded border border-zinc-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500 hover:border-quantum/50 hover:text-quantum"
        >
          Refresh
        </button>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-[1.3fr_1fr]">
        <OiCompass stocks={data.oiBuildup} />
        <VixStrip vix={data.vix} />
      </div>

      <MaxPainSkyline indices={data.indices} />
      <PcrDials indices={data.indices} />

      <ToolFooterMark sourceNote="Sourced from NSE F&O bhavcopy, option chain & VIX history" />
    </div>
  );
}
