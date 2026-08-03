"use client";

import { Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/Wordmark";
import { cn } from "@/lib/utils";

/**
 * The terminal's own boot sequence.
 *
 * Two moments used to render badly: a reload flashed the sign-in screen at a
 * fully-authenticated operator for one frame (session restore is async, and
 * "not authenticated yet" and "not authenticated" were the same `false`), and
 * once past that gate the board painted as a patchwork of independent panel
 * skeletons filling in over a second or two, rather than reading as one
 * terminal coming online. This is one continuous sequence for both — a
 * breathing core, a filling arc, and rotating on-brand status copy — rather
 * than either.
 *
 * Never a hard, indefinite gate: the caller is expected to dismiss this on a
 * timeout even if a stage never reports done, so a slow or failed network
 * call degrades to the dashboard's own per-panel skeletons rather than
 * stranding the operator on a spinner that never resolves.
 */

export interface BootStage {
  done: boolean;
}

/**
 * A few lines per stage rather than one, cycled on a timer — the same
 * information ("still checking your session") reads as alive rather than
 * frozen when it's not the same six words sitting still. Written in the
 * terminal's own vocabulary (Aegis/Zenith, RRG, Quantum Horizon, Autopilot)
 * rather than generic loading copy.
 */
const STAGE_COPY: string[][] = [
  ["Authenticating operator…", "Confirming SmartAPI session…", "Unlocking the terminal…"],
  [
    "Loading the scrip master…",
    "Indexing NIFTY · BANKNIFTY · FINNIFTY…",
    "Mapping strikes to tokens…",
  ],
  [
    "Calibrating Aegis & Zenith walls…",
    "Spinning up the RRG quadrants…",
    "Charting the Quantum Horizon…",
    "Warming the Autopilot…",
  ],
];
const DONE_COPY = "All systems engaged.";
const LINE_MS = 1500;

export function BootScreen({
  stages,
  lines: linesOverride,
  doneCopy = DONE_COPY,
}: {
  stages: BootStage[];
  /**
   * Override the on-brand copy per stage — the desktop terminal's own
   * ("Authenticating operator…", "Loading the scrip master…") describes a
   * SmartAPI session and a scrip master, neither of which exists on the
   * mobile companion's boot; a caller with a different sequence of events
   * to narrate passes its own lines here rather than inheriting wrong ones.
   */
  lines?: string[][];
  doneCopy?: string;
}) {
  const stageCopy = linesOverride ?? STAGE_COPY;
  const activeIndex = stages.findIndex((s) => !s.done);
  const complete = activeIndex === -1;
  const stageIndex = complete ? stages.length - 1 : activeIndex;
  const lines = stageCopy[stageIndex] ?? stageCopy[stageCopy.length - 1];

  const [lineIndex, setLineIndex] = useState(0);
  useEffect(() => {
    setLineIndex(0);
    if (complete) return;
    const id = setInterval(() => setLineIndex((i) => (i + 1) % lines.length), LINE_MS);
    return () => clearInterval(id);
    // Cycling resets on a stage change and stops once complete; the lines
    // array is stable per stage index and doesn't need to retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIndex, complete]);

  const doneCount = stages.filter((s) => s.done).length;
  const progress = Math.min(100, Math.max(8, (doneCount / (stages.length || 1)) * 100));
  const text = complete ? doneCopy : lines[lineIndex];

  return (
    <main className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-zinc-950">
      {/* A soft, breathing core — light rather than a hard scan line, the
          quietly living thing a modern loading screen should feel like. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[620px] w-[620px] animate-drift rounded-full bg-quantum/[0.09] blur-[140px]" />
      </div>
      <div aria-hidden className="dk-grid-bg pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative flex animate-in flex-col items-center gap-9 fade-in zoom-in-95 duration-700">
        {/* Core emblem — the same square mark the sign-in screen uses, just a
            little larger for a screen with nothing else on it. Static, not
            pulsing: the boot sequence's own progress bar and status copy
            already say something is moving. */}
        <div className="relative flex h-11 w-11 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
          <Zap className="relative h-5 w-5 text-quantum" />
        </div>

        <div className="text-center leading-none">
          {/* No text-shadow on the "K" here — a breathing background and a
              glowing letter both fighting for attention is the opposite of
              the calm this screen is going for. */}
          <Wordmark className="text-[17px] font-semibold tracking-[0.18em]" glow={false} />
          <div className="mt-2 text-[9px] uppercase tracking-[0.24em] text-zinc-500">
            Terminal · DKMS
          </div>
        </div>

        {/* Fluid progress — a filling arc, and rotating status copy that
            crossfades on every line change, not a checklist accumulating
            underneath it. */}
        <div className="flex w-80 flex-col items-center gap-4">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-zinc-800/70">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r from-quantum/30 via-quantum to-quantum/60 transition-[width] duration-700 ease-out",
                complete && "from-quantum via-quantum to-quantum",
              )}
              style={{ width: `${progress}%`, boxShadow: "0 0 10px rgba(0,240,255,0.5)" }}
            />
          </div>

          <div
            key={text}
            className="flex animate-fade-up items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                complete ? "bg-emerald-400" : "bg-quantum animate-pulse-ring",
              )}
            />
            {text}
          </div>
        </div>
      </div>
    </main>
  );
}
