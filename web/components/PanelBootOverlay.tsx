"use client";

import { Loader2, Zap } from "lucide-react";

/**
 * A panel-scoped rendition of the terminal's own boot sequence.
 *
 * The maturing overlays RRG and Quantum Horizon already draw over
 * half-formed data are deliberately quiet — the numbers underneath are
 * already real, just incomplete. This is a different claim: the panel has
 * *no* data for what's on screen yet, either because a real session just
 * landed or because the operator just switched instrument. That deserves
 * the same weight the full-page `BootScreen` gives it — the emblem and the
 * on-brand vocabulary — not a bare spinner easy to miss over a panel that
 * otherwise looks finished.
 */
/**
 * `compact` is a single-row rendition for panels too thin to hold the
 * stacked emblem-over-label layout without overflowing it (e.g. a ~50px
 * status strip) — same vocabulary, laid out horizontally instead.
 */
export function PanelBootOverlay({ label, compact = false }: { label: string; compact?: boolean }) {
  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="absolute inset-0 z-20 flex items-center justify-center gap-2 rounded-md bg-zinc-950/80 backdrop-blur-[2px]"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-quantum/40 bg-quantum/10">
          <Zap className="h-2.5 w-2.5 text-quantum" />
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          <Loader2 className="h-3 w-3 animate-spin text-quantum" />
          Loading {label}…
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-md bg-zinc-950/80 backdrop-blur-[2px]"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
        <Zap className="h-4 w-4 text-quantum" />
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-quantum" />
        Loading {label}…
      </div>
    </div>
  );
}
