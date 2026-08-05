"use client";

import { Ban, Crosshair, Lock, Loader2, Minus, Moon, Plus, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PanelBootOverlay } from "@/components/PanelBootOverlay";
import { QuadrantPill } from "@/components/QuadrantPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { useEngineContext } from "@/components/EngineProvider";
import { ratesForUnderlying, roundTripCharges } from "@/lib/engine/charges";
import { optionExchange } from "@/lib/engine/config";
import { fetchMargin } from "@/lib/market/client";
import type {
  ExecutionMode,
  LedgerSnapshot,
  MarginEstimate,
  OptionChain,
  Signal,
} from "@/lib/types";
import {
  BLOCK_REASONS,
  PROTOCOL_META,
  cn,
  compact,
  fmt,
  money,
  pnlTone,
  signedMoney,
} from "@/lib/utils";

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
  chain,
  onExecuted,
  ledger,
}: {
  signal: Signal | undefined;
  mode: ExecutionMode;
  /** The chain the signal came from — for the contract's own book detail. */
  chain?: OptionChain;
  onExecuted: () => void;
  /** Whether this signal's own contract already has a position open on it. */
  ledger?: LedgerSnapshot;
}) {
  const [lots, setLots] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [margin, setMargin] = useState<MarginEstimate | null>(null);
  const engine = useEngineContext();
  const marketOpen = engine.snapshot?.market_open ?? false;
  const authenticated = engine.session.authenticated;

  // Follow the engine's sizing until the user overrides it for this signal.
  const suggested = signal?.sizing?.lots ?? 0;
  useEffect(() => {
    setLots(null);
    setResult(null);
  }, [signal?.token, signal?.protocol]);

  /**
   * A position already open on this exact contract — the one thing the
   * signal itself never knows about, since `SignalEngine.evaluate()` is a
   * pure function of the chain and has no view of the ledger. Locks the
   * Execute button so a re-actionable signal (or an impatient click) can't
   * stack a second entry on top of the one Autopilot or a prior click already
   * took; the max-position/portfolio-risk ceilings in `executeSignal` are the
   * backstop, not the intended path.
   */
  const openPosition = useMemo(
    () => ledger?.open_positions.find((p) => p.token === signal?.token) ?? null,
    [ledger, signal?.token],
  );

  /**
   * Autopilot fires against whichever underlying qualifies, on its own timer
   * — an operator watching this exact signal would otherwise see nothing
   * happen beyond the risk-event log. Surfacing it here reuses the same
   * banner a manual execute leaves behind, keyed off `ts` so a fill is shown
   * once, not on every tick that follows it.
   */
  const shownAutoFillRef = useRef(0);
  useEffect(() => {
    if (!signal) return;
    const fill = engine.autoFills[signal.underlying];
    if (fill && fill.ts !== shownAutoFillRef.current) {
      shownAutoFillRef.current = fill.ts;
      setResult({ ok: fill.ok, message: `Autopilot — ${fill.message}` });
    }
  }, [engine.autoFills, signal]);

  const rationale = useMemo(
    () => (signal?.rationale ?? []).filter((line) => !COA_PROSE.test(line)),
    [signal?.rationale],
  );

  const effectiveLots = lots ?? suggested;
  const lotSize = signal?.sizing?.lot_size ?? 0;
  const quantity = effectiveLots * lotSize;
  const entryPrice = signal?.entry_price ?? 0;
  const token = signal?.token ?? null;

  /**
   * What the broker will actually block.
   *
   * Premium is what the trade costs; margin is what it ties up, and for the
   * capital cap in the sizing to mean anything it has to be the second number.
   * Debounced, because the lot stepper is a button an operator holds down.
   */
  useEffect(() => {
    if (!authenticated || !token || quantity <= 0 || entryPrice <= 0) {
      setMargin(null);
      return;
    }
    let cancelled = false;
    // SENSEX/BANKEX list on BSE, not NSE — the same split `dhanOptionSegment`
    // already makes for Dhan's own request shape.
    const exchange = optionExchange(signal?.underlying ?? "");
    const id = setTimeout(() => {
      void fetchMargin([
        {
          exchange,
          qty: quantity,
          price: entryPrice,
          productType: "INTRADAY",
          token,
          tradeType: "BUY",
          orderType: "LIMIT",
        },
      ])
        .then((res) => {
          if (!cancelled) setMargin(res.margin);
        })
        .catch(() => {
          if (!cancelled) setMargin(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [authenticated, token, quantity, entryPrice, signal?.underlying]);

  /**
   * The trade's arithmetic, after costs.
   *
   * A paper ledger that ignores charges answers a different question from the
   * one being asked: on index options STT and exchange turnover dominate, so
   * the breakeven is meaningfully above the entry and a 1:2 gross reward is not
   * 1:2 net. These are the same numbers the ledger will book on the fill.
   */
  const math = useMemo(() => {
    if (!signal?.entry_price || !signal.sizing || quantity <= 0) return null;
    const entry = signal.entry_price;
    const stop = signal.stop_loss ?? 0;
    const tp1 = signal.target_1 ?? 0;

    const rates = ratesForUnderlying(signal.underlying);
    const atStop = roundTripCharges({ price: entry, quantity }, stop || entry, rates);
    const atTarget = roundTripCharges({ price: entry, quantity }, tp1 || entry, rates);

    const grossLoss = stop > 0 ? (entry - stop) * quantity : 0;
    const grossGain = tp1 > 0 ? (tp1 - entry) * quantity : 0;
    const netLoss = grossLoss + atStop.total;
    const netGain = grossGain - atTarget.total;

    return {
      cost: entry * quantity,
      charges: atTarget,
      netLoss,
      netGain,
      rr: netLoss > 0 ? netGain / netLoss : null,
      // Every rupee of charge has to be earned back before the trade is level.
      breakeven: entry + atTarget.total / quantity,
    };
  }, [signal?.entry_price, signal?.stop_loss, signal?.target_1, signal?.sizing, signal?.underlying, quantity]);

  /** The contract's own book, for the node the engine picked. */
  const leg = useMemo(() => {
    if (!chain || !signal?.strike || !signal.option_type) return null;
    const row = chain.rows.find((r) => r.strike === signal.strike);
    return signal.option_type === "CE" ? (row?.call ?? null) : (row?.put ?? null);
  }, [chain, signal?.strike, signal?.option_type]);

  const daysToExpiry = useMemo(() => {
    if (!chain?.expiry) return null;
    const days = Math.round(
      (Date.parse(`${chain.expiry}T15:40:00+05:30`) - Date.now()) / 86_400_000,
    );
    return Number.isFinite(days) ? Math.max(0, days) : null;
  }, [chain?.expiry]);

  if (!signal) {
    return (
      <CardContent className="relative min-h-[280px] p-2">
        <PanelBootOverlay label="the signal engine" />
      </CardContent>
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
    // Body only: the deck that hosts this panel owns the card, the title and
    // the tab strip, so the engine and the trade book share one frame.
    <>
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

        {/* What the trade is actually worth, after what it costs */}
        {math ? (
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="dk-label">Trade Math</span>
              <span
                title="Reward against risk, both net of charges. Gross ratios flatter an options trade — the costs land on the loss side twice."
                className={cn(
                  "font-mono text-[10px] font-semibold",
                  math.rr === null
                    ? "text-zinc-500"
                    : math.rr >= 1.5
                      ? "text-emerald-300"
                      : math.rr >= 1
                        ? "text-amber-300"
                        : "text-rose-300",
                )}
              >
                {math.rr === null ? "—" : `${fmt(math.rr, 2)} : 1 net`}
              </span>
            </div>

            <div className="mt-1.5 grid grid-cols-4 gap-1">
              <Metric
                label="Risk"
                value={money(math.netLoss, 0)}
                tone="text-rose-300"
                title="Loss at the stop, including the charges on both legs."
              />
              <Metric
                label="Reward"
                value={money(math.netGain, 0)}
                tone="text-emerald-300"
                title="Gain at TP1, after the charges on both legs."
              />
              <Metric
                label="B/E"
                value={money(math.breakeven)}
                title="Premium the contract has to reach before the trade is level on costs."
              />
              <Metric
                label="Costs"
                value={money(math.charges.total, 0)}
                tone="text-amber-300/90"
                title={`Round trip: brokerage ${money(math.charges.entry.brokerage + math.charges.exit.brokerage, 0)}, STT ${money(math.charges.exit.stt, 0)}, exchange + SEBI ${money(math.charges.entry.exchange + math.charges.exit.exchange + math.charges.entry.sebi + math.charges.exit.sebi, 0)}, stamp ${money(math.charges.entry.stamp, 0)}, GST ${money(math.charges.entry.gst + math.charges.exit.gst, 0)}. The ledger books exactly these on a paper fill.`}
              />
            </div>

            {/* Margin — what the broker blocks, which is not what it costs */}
            <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t border-zinc-800/70 pt-1.5 font-mono text-[10px]">
              <span className="dk-label text-[9px]">Margin</span>
              {margin ? (
                <span
                  title={
                    engine.session.broker === "dhan"
                      ? `Dhan margin calculator: span ${money(margin.span, 0)}, exposure ${money(margin.exposure ?? 0, 0)}, brokerage ${money(margin.brokerage ?? 0, 0)}, premium ${money(margin.net_premium, 0)}.`
                      : `Angel One batch margin calculator: span ${money(margin.span, 0)}, net premium ${money(margin.net_premium, 0)}, options premium ${money(margin.options_premium, 0)}, benefit ${money(margin.benefit, 0)}.`
                  }
                  className="truncate text-zinc-300"
                >
                  {money(margin.total, 0)}
                  <span className="ml-1.5 text-zinc-600">
                    premium {money(margin.net_premium || math.cost, 0)}
                  </span>
                </span>
              ) : (
                <span className="text-zinc-600">
                  {authenticated ? "calculating…" : "needs a broker session"}
                </span>
              )}
            </div>
          </div>
        ) : null}

        {/* The contract's own book */}
        {leg || chain?.expiry ? (
          <div className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="dk-label">Contract</span>
              <span className="font-mono text-[9px] text-zinc-500">
                {chain?.expiry ?? "—"}
                {daysToExpiry !== null ? (
                  <span
                    className={cn(
                      "ml-1.5",
                      daysToExpiry <= 1 ? "text-amber-300" : "text-zinc-600",
                    )}
                    title="Days to expiry. Inside a day, theta is the dominant term in this premium."
                  >
                    {daysToExpiry}d
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-4 gap-1 font-mono text-[10px]">
              <div title="Open interest on this contract.">
                <span className="dk-label text-[8px]">OI</span>{" "}
                <span className="text-zinc-300">{compact(leg?.oi ?? 0)}</span>
              </div>
              <div title="Open interest added or unwound since the session open.">
                <span className="dk-label text-[8px]">ΔOI</span>{" "}
                <span
                  className={cn(
                    (leg?.oi_change ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {leg ? compact(leg.oi_change) : "—"}
                </span>
              </div>
              <div title="Session volume on this contract.">
                <span className="dk-label text-[8px]">Vol</span>{" "}
                <span className="text-zinc-300">{compact(leg?.volume ?? 0)}</span>
              </div>
              <div
                className="text-right"
                title="Bid-ask spread — what crossing it costs on top of the charges above."
              >
                <span className="dk-label text-[8px]">Spread</span>{" "}
                <span
                  className={cn(
                    leg && leg.best_bid > 0 && leg.best_ask - leg.best_bid > leg.best_bid * 0.02
                      ? "text-amber-300"
                      : "text-zinc-300",
                  )}
                >
                  {leg && leg.best_bid > 0 ? fmt(leg.best_ask - leg.best_bid) : "—"}
                </span>
              </div>
            </div>
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
        {/* A paper fill out of hours is a legitimate thing to want — you are
            testing the strategy, not the exchange — but it books at the last
            close and sits still until the bell, so say that rather than let a
            flat P&L look like a flat market. */}
        {!marketOpen && mode === "paper" ? (
          <div className="flex items-start gap-1.5 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-[9px] leading-snug text-zinc-500">
            <Moon className="mt-px h-3 w-3 shrink-0 text-zinc-600" />
            <span>
              Market closed — this books at the last traded price and marks flat
              until the 9:15 bell, then tracks live.
            </span>
          </div>
        ) : null}
        {openPosition ? (
          /*
           * The signal keeps recomputing against the same contract every
           * tick whether or not it's already been traded — this is the only
           * thing on the panel that says so, in place of the Execute button a
           * re-actionable signal would otherwise still be offering.
           */
          <div className="flex items-start gap-2 rounded border border-quantum/30 bg-quantum/5 px-2 py-2 text-[10px] leading-snug text-zinc-400">
            <Lock className="mt-px h-3.5 w-3.5 shrink-0 text-quantum/70" />
            <span>
              <span className="font-semibold uppercase tracking-wider text-quantum/90">
                Position open
              </span>
              {" — "}
              {openPosition.lots} lot{openPosition.lots === 1 ? "" : "s"} via{" "}
              {openPosition.automation === "auto" ? "Autopilot" : "manual entry"} ·{" "}
              <span className={pnlTone(openPosition.unrealised_pnl)}>
                {signedMoney(openPosition.unrealised_pnl, 0)}
              </span>
              . Close it from the Trade Book before re-entering.
            </span>
          </div>
        ) : signal.actionable ? (
          /*
           * Deliberately quiet. A paper fill is a routine act and a full-width
           * neon slab reads as an alarm — the eye should go to the geometry
           * above it, not here. Live routing is the exception and keeps the red
           * fill, because that one is not routine.
           */
          <Button
            variant={mode === "live" ? "danger" : "outline"}
            size="sm"
            className={cn(
              "h-8 w-full",
              mode === "live"
                ? ""
                : "border-quantum/40 text-quantum hover:border-quantum/70 hover:bg-quantum/10",
            )}
            onClick={execute}
            disabled={busy || effectiveLots <= 0}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : mode === "live" ? (
              <Zap className="h-3.5 w-3.5" />
            ) : (
              <Crosshair className="h-3.5 w-3.5" />
            )}
            {busy
              ? "Routing"
              : `Execute ${mode === "live" ? "Live" : "Paper"} · ${effectiveLots} lot${effectiveLots === 1 ? "" : "s"}`}
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
    </>
  );
}
