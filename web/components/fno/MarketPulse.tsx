"use client";

import { Activity, RefreshCw } from "lucide-react";

import { cn, fmt, timeAgo } from "@/lib/utils";

/**
 * The header strip: benchmark read, session date, and a manual refresh —
 * this dashboard has no live feed to auto-poll a countdown against, so it
 * states plainly what session it is showing rather than implying "live".
 */
export function MarketPulse({
  benchmarkLabel,
  benchmarkClose,
  benchmarkChangePct,
  asOf,
  fetchedAt,
  loading,
  onRefresh,
}: {
  benchmarkLabel: string;
  benchmarkClose: number;
  benchmarkChangePct: number;
  asOf: string;
  fetchedAt: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const up = benchmarkChangePct >= 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-zinc-800/70 bg-zinc-900/40 px-3 py-2 shadow-panel backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <Activity className={cn("h-3.5 w-3.5", up ? "text-emerald-400" : "text-rose-400")} />
        <span className="font-mono text-xs font-semibold text-zinc-200">{benchmarkLabel}</span>
        <span className="font-mono text-xs tabular-nums text-zinc-300">{fmt(benchmarkClose)}</span>
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            up ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {up ? "+" : ""}
          {fmt(benchmarkChangePct)}%
        </span>
      </div>

      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
        Session {asOf}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          Data {timeAgo(fetchedAt)}
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          className={cn(
            "flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-400 transition-colors hover:border-quantum/50 hover:text-quantum disabled:opacity-40",
          )}
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>
    </div>
  );
}
