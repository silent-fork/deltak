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
 * Deliberately built from the homepage's own vocabulary rather than a
 * separate "loading screen" look: the `dk-grid-bg` floor, the same top-lit
 * glow the hero sits under, the "DeltaK Matrix Strategy · DKMS" pill and the
 * five-index chip row all reappear here, staggered in rather than dumped at
 * once — so the first thing an operator sees mid-load is recognisably the
 * same product whose homepage they just clicked "Terminal" from, not a
 * generic spinner screen bolted on afterward.
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

/** The homepage's own instrument roll call — see the hero chip row on `/`. */
const INSTRUMENTS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "BANKEX"] as const;

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
    <main className="dk-grid-bg relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-zinc-950">
      {/* Same top-lit glow the homepage's hero sits under — a wide, static
          anchor light — plus the breathing core beneath it for depth. Two
          light sources read as atmosphere; either alone reads as decoration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.07] blur-[140px]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[620px] w-[620px] animate-drift rounded-full bg-quantum/[0.09] blur-[140px]" />
      </div>

      <div className="relative flex animate-in flex-col items-center gap-7 fade-in zoom-in-95 duration-700">
        {/* The homepage's own hero pill, reappearing here first — the same
            beat the hero opens on, before the wordmark even renders. */}
        <span
          className="animate-fade-up rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400"
          style={{ animationDelay: "80ms" }}
        >
          DeltaK Matrix Strategy · DKMS
        </span>

        {/* Core emblem — the same square mark the homepage header and the
            sign-in screen use, just larger for a screen with nothing else on
            it. `shadow-quantum` gives it the same glow ring the terminal's
            own focused/armed surfaces carry, instead of a plain border.
            Static, not pulsing: the progress bar and status copy below
            already say something is moving. */}
        <div
          className="relative flex h-11 w-11 animate-fade-up items-center justify-center rounded-md border border-quantum/40 bg-quantum/10 shadow-quantum"
          style={{ animationDelay: "160ms" }}
        >
          <Zap className="relative h-5 w-5 text-quantum" />
        </div>

        <div
          className="animate-fade-up text-center leading-none"
          style={{ animationDelay: "220ms" }}
        >
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
            underneath it. Housed in the same bordered, blurred surface every
            panel on this product sits in, rather than floating bare. */}
        <div
          className="dk-panel flex w-80 animate-fade-up flex-col items-center gap-4 rounded-xl px-5 py-4"
          style={{ animationDelay: "300ms" }}
        >
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

        {/* The homepage's own instrument roll call, reappearing under the
            status card — five chips fading in in sequence rather than all at
            once, so the boot sequence itself reads as one more thing coming
            online instead of a static footer. */}
        <div className="flex max-w-xs flex-wrap items-center justify-center gap-1.5">
          {INSTRUMENTS.map((chip, i) => (
            <span
              key={chip}
              className="animate-fade-up rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500"
              style={{ animationDelay: `${380 + i * 60}ms` }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
