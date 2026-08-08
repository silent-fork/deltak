"use client";

import { useEffect, useState } from "react";

import { BrandIcon } from "@/components/BrandIcon";
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
 * terminal coming online. This is one continuous sequence for both — a real
 * terminal window with a scrolling boot log and a live block cursor —
 * rather than either.
 *
 * Built around the same `K` + blinking-cursor language the rest of the
 * brand now uses (`BrandIcon`, `Wordmark`): a chrome bar, a scrolling
 * transcript of the actual boot copy below with the active line still
 * "typing" under a live cursor, and a bracket-framed progress meter —
 * rather than a single status line crossfading in place.
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
 * plus a little F&O-trader wit, rather than generic loading copy — and
 * deliberately broker-agnostic: this same sequence runs for an Angel One
 * SmartAPI session and a Dhan one, so it never names either.
 */
const STAGE_COPY: string[][] = [
  [
    "Checking your credentials, not your greeks…",
    "Clearing you for entry…",
    "Unlocking the terminal — patience has no theta decay…",
  ],
  [
    "Counting every strike so you don't have to…",
    "Rounding up NIFTY, BANKNIFTY, FINNIFTY, SENSEX and BANKEX…",
    "Mapping strikes to tokens — no assignment surprises…",
  ],
  [
    "Building the walls Aegis and Zenith are about to defend…",
    "Spinning up the RRG — momentum waits for no one…",
    "Drawing the Quantum Horizon, where calls and puts pick sides…",
    "Waking Autopilot — it never needs a coffee break…",
  ],
];
const DONE_COPY = "All systems engaged — go find your edge.";
const LINE_MS = 1500;

/** The homepage's own instrument roll call — see the hero chip row on `/`. */
const INSTRUMENTS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "BANKEX"] as const;

/** How many transcript rows the terminal body keeps visible at once. */
const LOG_ROWS = 5;

/** Same intensity `BrandIcon`'s cursor uses — one glow value for the mark everywhere it appears. */
const CURSOR_GLOW = { boxShadow: "0 0 10px rgba(0,240,255,0.55)" };

function Cursor({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block w-[0.5em] shrink-0 animate-pulse-ring self-center bg-quantum", className)}
      style={{ height: "1em", ...CURSOR_GLOW }}
    />
  );
}

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
  // Resets the cycle on a stage change — the React-documented "adjust state
  // during render" pattern (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than a setState call inside the effect below, which would fire on
  // every render of a mounted stage, not just the transition into a new one.
  const [prevStageIndex, setPrevStageIndex] = useState(stageIndex);
  if (stageIndex !== prevStageIndex) {
    setPrevStageIndex(stageIndex);
    setLineIndex(0);
  }

  useEffect(() => {
    if (complete) return;
    const id = setInterval(() => setLineIndex((i) => (i + 1) % lines.length), LINE_MS);
    return () => clearInterval(id);
    // Cycling stops once complete; the lines array is stable per stage index
    // and doesn't need to retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIndex, complete]);

  const doneCount = stages.filter((s) => s.done).length;
  const progress = Math.min(100, Math.max(8, (doneCount / (stages.length || 1)) * 100));
  const text = complete ? doneCopy : lines[lineIndex];

  // A scrolling transcript, not a single line swapping in place: every line
  // actually spoken accumulates here, capped to the panel's visible rows —
  // the terminal reads as one continuous boot log rather than a status
  // readout crossfading over itself. Same adjust-during-render pattern as
  // `stageIndex` above rather than a setState call inside an effect, which
  // would fire on every render, not just the transition to a new line.
  const [history, setHistory] = useState<string[]>([]);
  const [prevText, setPrevText] = useState(text);
  if (text !== prevText) {
    setPrevText(text);
    setHistory((h) => {
      const next = [...h, text];
      return next.length > LOG_ROWS ? next.slice(next.length - LOG_ROWS) : next;
    });
  }

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

      <div className="relative flex w-full max-w-lg animate-in flex-col items-center gap-6 fade-in zoom-in-95 px-6 duration-700">
        {/* The homepage's own hero pill, reappearing here first — the same
            beat the hero opens on, before the wordmark even renders. */}
        <span
          className="animate-fade-up rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400"
          style={{ animationDelay: "80ms" }}
        >
          DeltaK Matrix Strategy · DKMS
        </span>

        {/* Core emblem — the same mark the homepage header and the sign-in
            screen use, just larger for a screen with nothing else on it.
            Quiet on purpose: the terminal window below is the one thing on
            this screen that gets to animate loudly. */}
        <div
          className="flex animate-fade-up items-center gap-2.5"
          style={{ animationDelay: "160ms" }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10"
            style={{ boxShadow: "0 0 0 1px rgba(0,240,255,0.16), 0 0 12px rgba(0,240,255,0.06)" }}
          >
            <BrandIcon size="md" glow={false} />
          </div>
          <Wordmark className="text-[16px] font-semibold tracking-[0.18em]" glow={false} />
        </div>

        {/* The terminal window — chrome bar, scrolling boot log with a live
            cursor on the active line, bracket-framed progress meter. */}
        <div
          className="relative w-full animate-fade-up overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80"
          style={{
            animationDelay: "240ms",
            boxShadow: "0 0 0 1px rgba(0,240,255,0.06), 0 24px 60px -24px rgba(0,0,0,0.65)",
          }}
        >
          {/* A faint render-sweep ambient to the window, not the boot copy —
              cheap CSS-only motion so the panel itself reads as "live"
              even between line changes. Off once booted; a "ready" screen
              doesn't need to keep scanning itself. */}
          {!complete ? (
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-full animate-scan bg-gradient-to-b from-transparent via-quantum/[0.05] to-transparent" />
            </div>
          ) : null}

          <div className="relative flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
            <span className="h-2 w-2 rounded-full bg-zinc-700" />
            <span className="h-2 w-2 rounded-full bg-zinc-700" />
            <span className={cn("h-2 w-2 rounded-full", complete ? "bg-emerald-400" : "bg-quantum animate-pulse-ring")} />
            <span className="ml-2 font-mono text-[10px] tracking-wide text-zinc-500">k@dkms:~/boot$</span>
          </div>

          {/* Log body — a fixed number of rows, newest pinned to the
              bottom, so the transcript scrolls the way a real terminal
              does instead of the panel growing with it. */}
          <div className="relative flex h-[150px] flex-col justify-end gap-1.5 overflow-hidden px-3.5 py-3 font-mono text-[11px] leading-[1.7]">
            {history.map((line, i) => {
              const isActive = i === history.length - 1;
              if (!isActive) {
                return (
                  <div key={`${i}-${line}`} className="flex items-start gap-2 text-zinc-600">
                    <span className="shrink-0 text-zinc-700">›</span>
                    <span className="truncate">{line}</span>
                  </div>
                );
              }
              return (
                <div key={`${i}-${line}`} className="flex items-start gap-2">
                  <span className={cn("shrink-0", complete ? "text-emerald-400" : "text-quantum")}>
                    {complete ? "✓" : "›"}
                  </span>
                  <span className={complete ? "text-zinc-300" : "text-zinc-200"}>
                    {line}
                    {!complete ? <Cursor className="ml-1" /> : null}
                  </span>
                </div>
              );
            })}
            {/* Once booted, one more idle prompt below the "done" line — a
                terminal sitting ready for input, not one that just stopped. */}
            {complete ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <span className="text-quantum">{">"}</span>
                <Cursor />
              </div>
            ) : null}
          </div>

          {/* Bracket-framed progress meter — a real smooth bar between two
              literal `[` `]` characters rather than a block-character bar,
              which reads as ragged at arbitrary widths under a monospace
              font's fixed glyph metrics. */}
          <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5 font-mono text-[10px]">
            <span className="text-zinc-700">[</span>
            <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={cn(
                  "h-full rounded-full bg-quantum transition-[width] duration-700 ease-out",
                  complete && "bg-emerald-400",
                )}
                style={{ width: `${progress}%`, boxShadow: complete ? undefined : "0 0 8px rgba(0,240,255,0.5)" }}
              />
            </div>
            <span className="text-zinc-700">]</span>
            <span className="w-8 shrink-0 text-right tabular-nums text-zinc-500">{Math.round(progress)}%</span>
          </div>
        </div>

        {/* The homepage's own instrument roll call, reappearing beneath the
            terminal as one more line the boot sequence "prints" — an array
            literal rather than a chip row, in keeping with the window
            above it. */}
        <div
          className="animate-fade-up px-1 text-center font-mono text-[10px] leading-relaxed text-zinc-600"
          style={{ animationDelay: "380ms" }}
        >
          <span className="text-zinc-700">instruments </span>
          <span className="text-zinc-700">[</span>
          {INSTRUMENTS.map((chip, i) => (
            <span key={chip}>
              <span className="text-quantum/70">{chip}</span>
              {i < INSTRUMENTS.length - 1 ? <span className="text-zinc-700">, </span> : null}
            </span>
          ))}
          <span className="text-zinc-700">]</span>
        </div>
      </div>
    </main>
  );
}
