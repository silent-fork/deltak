"use client";

import { Ban, Crosshair, Loader2, Minus, Plus, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { QuadrantPill } from "@/components/QuadrantPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEngineContext } from "@/components/EngineProvider";
import type { ExecutionMode, Signal } from "@/lib/types";
import { BLOCK_REASONS, PROTOCOL_META, cn, fmt, money } from "@/lib/utils";

/**
 * The first three rationale lines restate the COA levels, PCR and spot, which
 * the chain's COA strip now renders graphically. Dropping them here keeps the
 * sidebar inside one screen without losing anything.
 */
const COA_PROSE = /^(COA 1\.0 walls|COA 2\.0 live|PCR )/;

function Metric({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone?: string;
  title?: string;
}) {
  return (
    <div
      className="min-w-0 rounded border border-zinc-800 bg-zinc-950/50 px-1.5 py-1"
      title={title}
    >
      <div className="dk-label text-[9px] leading-none">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-[11px] font-semibold leading-none",
          tone ?? "text-zinc-100",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function SignalPanel({
  signal,
  mode,
  onExecuted,
}: {
  signal: Signal | undefined;
  mode: ExecutionMode;
  onExecuted: () => void;
}) {
  const [lots, setLots] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const engine = useEngineContext();

  // Follow the engine's sizing until the user overrides it for this signal.
  const suggested = signal?.sizing?.lots ?? 0;
  useEffect(() => {
    setLots(null);
    setResult(null);
  }, [signal?.token, signal?.protocol]);

  const rationale = useMemo(
    () => (signal?.rationale ?? []).filter((line) => !COA_PROSE.test(line)),
    [signal?.rationale],
  );

  const effectiveLots = lots ?? suggested;

  if (!signal) {
    return (
      <Card className="shrink-0">
        <CardContent className="py-6 text-center text-xs text-zinc-600">
          Signal engine warming up…
        </CardContent>
      </Card>
    );
  }

  const meta = PROTOCOL_META[signal.protocol];
  const entryCost =
    signal.entry_price && signal.sizing
      ? signal.entry_price * effectiveLots * signal.sizing.lot_size
      : 0;

  async function execute() {
    if (busy || effectiveLots <= 0) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await engine.executeSignal(signal!.underlying, effectiveLots);
      setResult({ ok: res.ok, message: res.message });
      onExecuted();
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Execution failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    // Sizes to its content and shrinks (scrolling internally) when the sidebar
    // is tight, but never grows — slack belongs to the event log, and growing
    // here would just open a gap above the execution button. The floor keeps
    // flex from crushing the panel into its own header on a short screen.
    <Card className="min-h-0 shrink-0 xl:min-h-[248px] xl:flex-[0_1_auto]">
      <CardHeader className="shrink-0">
        <CardTitle className="truncate">Delta-K Signal Engine</CardTitle>
        <Badge className={cn("shrink-0 font-semibold", meta.tone)}>
          Protocol {meta.name}
        </Badge>
      </CardHeader>

      <CardContent className="dk-scroll min-h-0 space-y-2 overflow-y-auto p-2">
        {/* Regime */}
        <div>
          <div className="text-[11px] font-semibold text-zinc-200">{meta.title}</div>
          <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{meta.blurb}</p>
        </div>

        {/* Target node */}
        {signal.trading_symbol ? (
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs font-semibold text-zinc-100">
                {signal.trading_symbol}
              </span>
              <QuadrantPill quadrant={signal.quadrant} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Badge
                className={cn(
                  "border-zinc-700",
                  signal.option_type === "CE" ? "text-emerald-300" : "text-rose-300",
                )}
              >
                {signal.option_type} {fmt(signal.strike, 0)}
              </Badge>
              <Badge
                className="border-quantum/40 bg-quantum/10 text-quantum"
                title="Zero-OTM rule — longs restricted to the 2nd/3rd ITM strike."
              >
                {signal.itm_depth} ITM
              </Badge>
            </div>
          </div>
        ) : null}

        {/* Risk geometry — one dense row instead of a 2×2 block */}
        <div className="grid grid-cols-4 gap-1">
          <Metric label="Entry" value={money(signal.entry_price)} />
          <Metric
            label="Stop"
            value={money(signal.stop_loss)}
            tone="text-rose-300"
            title={`${fmt(signal.stop_loss_points)} premium points`}
          />
          <Metric label="TP1" value={money(signal.target_1)} tone="text-emerald-300" />
          <Metric label="TP2" value={money(signal.target_2)} tone="text-emerald-300" />
        </div>

        {/* Sizing */}
        {signal.sizing ? (
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="dk-label">Position Size</span>
              <span className="truncate font-mono text-[10px] text-zinc-500">
                risk {fmt(signal.sizing.risk_pct, 2)}% ·{" "}
                {money(signal.sizing.risk_amount, 0)}
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Decrease lots"
                  onClick={() => setLots(Math.max(0, effectiveLots - 1))}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-10 text-center font-mono text-sm font-bold text-quantum">
                  {effectiveLots}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Increase lots"
                  onClick={() => setLots(effectiveLots + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex-1 text-right font-mono text-[10px] leading-tight text-zinc-500">
                <div>
                  {effectiveLots * signal.sizing.lot_size} qty ·{" "}
                  {signal.sizing.lot_size}/lot
                </div>
                <div className="text-zinc-300">Cost {money(entryCost, 0)}</div>
              </div>
            </div>

            {lots !== null && lots !== suggested ? (
              <button
                onClick={() => setLots(null)}
                className="mt-1 text-[9px] uppercase tracking-wider text-quantum/70 hover:text-quantum"
              >
                Reset to engine size ({suggested})
              </button>
            ) : null}

            {signal.sizing.capped_by ? (
              <div className="mt-1 text-[9px] uppercase tracking-wider text-amber-400/80">
                Capped ·{" "}
                {BLOCK_REASONS[signal.sizing.capped_by] ?? signal.sizing.capped_by}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Rationale */}
        {rationale.length ? (
          <ul className="space-y-0.5">
            {rationale.map((line, i) => (
              <li
                key={i}
                className="flex gap-1.5 text-[10px] leading-snug text-zinc-500"
              >
                <span className="text-zinc-700">›</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>

      {/* Execution stays pinned — never scrolls out of reach */}
      <div className="shrink-0 space-y-1.5 border-t border-zinc-800/70 p-2">
        {signal.actionable ? (
          <Button
            variant={mode === "live" ? "danger" : "quantum"}
            size="lg"
            className="w-full"
            onClick={execute}
            disabled={busy || effectiveLots <= 0}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "live" ? (
              <Zap className="h-4 w-4" />
            ) : (
              <Crosshair className="h-4 w-4" />
            )}
            {busy
              ? "Routing"
              : `Execute ${mode === "live" ? "LIVE" : "Paper"} · ${effectiveLots} lot${effectiveLots === 1 ? "" : "s"}`}
          </Button>
        ) : (
          <div className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-2 text-[10px] leading-snug text-zinc-500">
            <Ban className="mt-px h-3.5 w-3.5 shrink-0 text-zinc-600" />
            <span>
              <span className="font-semibold uppercase tracking-wider text-zinc-400">
                Entry blocked
              </span>
              {" — "}
              {signal.blocked_reason
                ? (BLOCK_REASONS[signal.blocked_reason] ?? signal.blocked_reason)
                : "no qualifying setup."}
            </span>
          </div>
        )}

        {result ? (
          <div
            className={cn(
              "rounded border px-2 py-1.5 text-[10px]",
              result.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-300",
            )}
          >
            {result.message}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
