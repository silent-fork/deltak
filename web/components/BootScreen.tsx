"use client";

import { CheckCircle2, Loader2, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The terminal's own boot sequence.
 *
 * Two moments used to render badly: a reload flashed the sign-in screen at a
 * fully-authenticated operator for one frame (session restore is async, and
 * "not authenticated yet" and "not authenticated" were the same `false`), and
 * once past that gate the board painted as a patchwork of independent panel
 * skeletons filling in over a second or two, rather than reading as one
 * terminal coming online. This is one full-screen screen for both — session
 * check, then the first live data landing — instead of either.
 *
 * Never a hard, indefinite gate: the caller is expected to dismiss this on a
 * timeout even if a stage never reports done, so a slow or failed network
 * call degrades to the dashboard's own per-panel skeletons rather than
 * stranding the operator on a spinner that never resolves.
 */

export interface BootStage {
  label: string;
  done: boolean;
}

export function BootScreen({ stages }: { stages: BootStage[] }) {
  return (
    <main className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-zinc-950">
      <div aria-hidden className="dk-grid-bg pointer-events-none absolute inset-0 opacity-60" />

      {/* A radar sweep down the screen — the same scan the RRG/COA panels run
          on the market itself, just full-screen while the terminal boots. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 h-32 animate-scan bg-gradient-to-b from-transparent via-quantum/[0.07] to-transparent" />
      </div>

      <div className="relative flex flex-col items-center gap-7">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-quantum/50 bg-quantum/10 shadow-quantum">
            <Zap className="h-6 w-6 animate-pulse-ring text-quantum" />
          </div>
          <div className="text-left leading-none">
            <div className="text-[20px] font-bold tracking-[0.18em] text-zinc-100">
              DELTA-K
            </div>
            <div className="mt-1.5 text-[9px] uppercase tracking-[0.26em] text-quantum/70">
              Terminal · DKMS
            </div>
          </div>
        </div>

        <div className="flex w-72 flex-col gap-2 rounded-md border border-zinc-800/70 bg-zinc-900/40 px-4 py-3 backdrop-blur-sm">
          {stages.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5 font-mono text-[11px]">
              {s.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-quantum" />
              )}
              <span className={cn(s.done ? "text-zinc-500 line-through decoration-zinc-700" : "text-zinc-200")}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-7 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-700">
        Delta-K Matrix Strategy
      </div>
    </main>
  );
}
