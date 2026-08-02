"use client";

import { AlertOctagon, Loader2, RefreshCw, Scissors, X } from "lucide-react";
import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Skeleton, SkeletonPanel } from "@/components/ui/skeleton";
import { useEngineContext } from "@/components/EngineProvider";
import { mergeBook } from "@/lib/engine/book";
import { istParts } from "@/lib/engine/config";
import type { LedgerSnapshot, Position } from "@/lib/types";
import { cn, fmt, money, pnlTone, signedMoney } from "@/lib/utils";

type Tab = "open" | "history";

/** A stored `opened_at`, as the day and IST time a trade-history card needs. */
function archiveDateLabel(openedAt: string): string {
  const at = new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(openedAt) ? openedAt : `${openedAt}Z`);
  if (Number.isNaN(at.getTime())) return "";
  const p = istParts(at);
  const hhmm = [p.hour, p.minute].map((v) => String(v).padStart(2, "0")).join(":");
  return `${p.date} · ${hhmm}`;
}

/** Why a position left the book, in the operator's language. */
const EXIT_REASON: Record<string, string> = {
  MANUAL: "Closed",
  TP1: "Scaled",
  TARGET: "Target",
  STOP_LOSS: "Stopped",
  DAYLIGHT_REST: "Rest",
  PANIC: "Flatten",
  INVALIDATION: "Invalid",
};

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/50 px-1.5 py-1">
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

/**
 * One position, as a card rather than a table row.
 *
 * The column is narrow and a seven-column table left every number clipped to
 * three characters. A card gives the contract its own line, puts the money on
 * the right where the eye lands, and — while a position is open — draws where
 * the last price sits between the stop and the target, which is the only
 * question being asked of an open trade.
 */
function PositionCard({
  position: p,
  closed,
  busy,
  readOnly = false,
  dateLabel,
  onScaleOut,
  onExit,
}: {
  position: Position;
  closed: boolean;
  busy: string | null;
  /** A persisted row from another (or a since-reloaded) session — nothing here can act on it. */
  readOnly?: boolean;
  /** When trades can span more than one day, the day has to be on the card. */
  dateLabel?: string;
  onScaleOut?: () => void;
  onExit?: () => void;
}) {
  const pnl = closed ? p.realised_pnl : p.unrealised_pnl;
  const up = pnl >= 0;

  // Where price stands between the stop and the target, when both are known.
  const sl = p.stop_loss;
  const tp = p.target;
  const span = sl !== null && tp !== null && tp > sl ? tp - sl : null;
  const travel =
    span !== null && sl !== null
      ? Math.min(100, Math.max(0, ((p.ltp - sl) / span) * 100))
      : null;

  return (
    <div
      className={cn(
        "rounded-md border bg-zinc-950/50 px-2 py-1.5",
        closed
          ? "border-zinc-800/70"
          : up
            ? "border-emerald-500/25"
            : "border-rose-500/25",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-[11px] font-semibold text-zinc-100">
            {p.trading_symbol}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            <span>
              {p.lots} lot{p.lots === 1 ? "" : "s"} · {p.quantity} qty
            </span>
            {p.protocol ? (
              <span className="rounded border border-zinc-800 px-1 text-zinc-400">
                {p.protocol}
              </span>
            ) : null}
            <span
              title={
                p.automation === "auto"
                  ? "Opened by Autopilot"
                  : "Opened by a manual Execute click"
              }
              className={cn(
                "rounded border px-1",
                p.automation === "auto"
                  ? "border-quantum/40 text-quantum"
                  : "border-zinc-800 text-zinc-500",
              )}
            >
              {p.automation === "auto" ? "AUTO" : "MANUAL"}
            </span>
            {closed && p.exit_reason ? (
              <span className="rounded border border-zinc-800 px-1 text-zinc-400">
                {EXIT_REASON[p.exit_reason] ?? p.exit_reason}
              </span>
            ) : null}
            {dateLabel ? <span className="text-zinc-600">{dateLabel}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-1">
          <div className={cn("text-right font-mono leading-tight", pnlTone(pnl))}>
            <div className="text-[12px] font-bold">{signedMoney(pnl, 0)}</div>
            <div className="text-[9px] opacity-75">
              {p.pnl_pct > 0 ? "+" : ""}
              {fmt(p.pnl_pct, 1)}%
            </div>
          </div>

          {!closed && !readOnly ? (
            <div className="flex items-center gap-0.5">
              <button
                title="Scale out 50% (TP1)"
                aria-label={`Scale out ${p.trading_symbol}`}
                disabled={busy !== null || p.lots < 2}
                onClick={onScaleOut}
                className="rounded p-1 text-amber-400/80 transition-colors hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-30"
              >
                {busy === `s-${p.id}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Scissors className="h-3 w-3" />
                )}
              </button>
              <button
                title="Close position"
                aria-label={`Close ${p.trading_symbol}`}
                disabled={busy !== null}
                onClick={onExit}
                className="rounded p-1 text-rose-400/80 transition-colors hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-30"
              >
                {busy === `x-${p.id}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-[10px]">
        <div>
          <span className="dk-label text-[8px]">Avg</span>{" "}
          <span className="text-zinc-300">{fmt(p.avg_price)}</span>
        </div>
        <div>
          <span className="dk-label text-[8px]">{closed ? "Exit" : "LTP"}</span>{" "}
          <span className="text-zinc-100">
            {closed ? (p.exit_price !== null ? fmt(p.exit_price) : "—") : fmt(p.ltp)}
          </span>
        </div>
        <div className="text-right">
          <span className="dk-label text-[8px]">{closed ? "Booked" : "Stop"}</span>{" "}
          <span className={closed ? "text-zinc-400" : "text-rose-400/90"}>
            {closed
              ? money(p.realised_pnl, 0)
              : sl !== null
                ? fmt(sl)
                : "—"}
          </span>
        </div>
      </div>

      {/* Stop → target, and where price has actually got to. */}
      {!closed && travel !== null ? (
        <div
          title={`Stop ${fmt(sl)} · last ${fmt(p.ltp)} · target ${fmt(tp)}`}
          className="relative mt-1.5 h-1 rounded-full bg-gradient-to-r from-rose-500/40 via-zinc-800 to-emerald-500/40"
        >
          <span
            className="absolute top-1/2 h-2.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-quantum"
            style={{ left: `${travel}%`, boxShadow: "0 0 6px rgba(0,240,255,0.8)" }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Memoized: `ledger` is a fresh object only when the ledger's own revision
 * actually moved (a fill, an exit, a mark that changed), and `onChanged` /
 * `onRefreshArchive` are stabilized at their call sites — see `SignalDeck`
 * and `TerminalPage`. A shallow-equal prop set means an identical book.
 */
export const TradeBook = memo(function TradeBook({
  ledger,
  onChanged,
  archive,
  archiveLoading,
  archiveError,
  onRefreshArchive,
}: {
  ledger: LedgerSnapshot | undefined;
  onChanged: () => void;
  /**
   * What Supabase holds for this account — every session that ever wrote to
   * it, not just this tab's. Owned by the deck, which mounts once for the
   * life of the page, so switching between the signal panel and the trade
   * book never re-fetches it. `null` before the first read resolves; the
   * tabs render from the live ledger alone until then, so a slow or failing
   * fetch never blanks a screen that already has something to show.
   */
  archive: Position[] | null;
  archiveLoading: boolean;
  archiveError: string | null;
  onRefreshArchive: () => void;
}) {
  const [tab, setTab] = useState<Tab>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmPanic, setConfirmPanic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engine = useEngineContext();

  if (!ledger) {
    return (
      <CardContent className="min-h-0 p-2">
        <SkeletonPanel label="Loading the ledger">
          <div className="grid shrink-0 grid-cols-4 gap-1">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[30px]" />
            ))}
          </div>
          <Skeleton className="h-[26px] shrink-0" />
          <Skeleton className="h-[64px] shrink-0" />
          <Skeleton className="h-[64px] shrink-0" />
        </SkeletonPanel>
      </CardContent>
    );
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setTimeout(() => setError(null), 6000);
    } finally {
      setBusy(null);
    }
  }

  const open = ledger.open_positions;

  /**
   * Both tabs merge the live engine with Supabase: the engine wins wherever it
   * still holds a position, because it is more current than any checkpoint and
   * is the only thing left `PositionCard` can actually act on. A Supabase row
   * with no live counterpart is one no object in this tab knows about anymore
   * — closed in a different browser, or open in a session this reload just
   * lost — and is shown, but read-only. Positions with no live match to fall
   * back on would otherwise vanish the moment a tab refreshes.
   */
  const { openRows, closedRows, openPnl, bookedPnl, deployedMargin } = mergeBook(
    ledger,
    archive,
  );
  const rows = tab === "open" ? openRows : closedRows;
  // Equity tracks the same open P&L the "Open" tile shows — capital already
  // carries this tab's own realised trades, so only the unrealised leg needs
  // folding in from the merge.
  const equity = ledger.capital + openPnl;

  return (
    // Body only: the deck owns the card, the title and the tab strip. The book
    // and the signal engine are two views of one position — what to take, and
    // what is already on — so they share a frame.
    <>
      <CardContent className="dk-scroll min-h-0 space-y-2 overflow-y-auto p-2">
        <div className="grid grid-cols-4 gap-1">
          <Metric label="Equity" value={money(equity, 0)} />
          <Metric
            label="Open"
            value={signedMoney(openPnl, 0)}
            tone={pnlTone(openPnl)}
          />
          <Metric
            label="Booked"
            value={signedMoney(bookedPnl, 0)}
            tone={pnlTone(bookedPnl)}
          />
          <Metric
            label="Deployed"
            value={money(deployedMargin, 0)}
            tone="text-zinc-300"
          />
        </div>

        {/* Open / history — a segmented control, not two chips. Which book
            you are looking at changes what every row below means. Both tabs
            now merge in Supabase, so the count includes rows this tab did not
            open itself. */}
        <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5">
          {(
            [
              ["open", "Open", openRows.length],
              ["history", "History", closedRows.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors",
                tab === key
                  ? "bg-quantum/15 text-quantum shadow-[inset_0_0_0_1px_rgba(0,240,255,0.35)]"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {label}
              <span
                className={cn(
                  "rounded px-1 font-mono text-[9px]",
                  tab === key ? "bg-quantum/20" : "bg-zinc-800/80 text-zinc-500",
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-600">
            {archiveError
              ? archiveError
              : "Synced with Supabase — survives a reload, spans every session."}
          </span>
          <button
            onClick={onRefreshArchive}
            disabled={archiveLoading}
            title="Refresh from Supabase"
            className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", archiveLoading && "animate-spin")} />
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="py-5 text-center text-[11px] text-zinc-600">
            {tab === "open" ? "No open positions." : "No closed trades yet."}
          </div>
        ) : (
          <div className="space-y-1">
            {rows.map(({ position: p, readOnly }) => (
              <PositionCard
                key={p.id}
                position={p}
                closed={tab !== "open"}
                busy={busy}
                readOnly={readOnly}
                dateLabel={archiveDateLabel(p.opened_at)}
                onScaleOut={
                  readOnly
                    ? undefined
                    : () => run(`s-${p.id}`, () => engine.scaleOutPosition(p.id))
                }
                onExit={
                  readOnly
                    ? undefined
                    : () => run(`x-${p.id}`, () => engine.exitPosition(p.id))
                }
              />
            ))}
          </div>
        )}

        {error ? (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300">
            {error}
          </div>
        ) : null}
      </CardContent>

      <div className="shrink-0 border-t border-zinc-800/70 p-2">
        {confirmPanic ? (
          <div className="flex items-center gap-2 rounded border border-rose-500/50 bg-rose-500/10 p-2">
            <span className="flex-1 text-[10px] leading-snug text-rose-200">
              Flatten all {open.length} position{open.length === 1 ? "" : "s"} at
              market?
            </span>
            <Button
              variant="danger"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                run("panic", async () => {
                  await engine.panicFlatten();
                  setConfirmPanic(false);
                })
              }
            >
              {busy === "panic" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmPanic(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            className="w-full"
            disabled={open.length === 0}
            onClick={() => setConfirmPanic(true)}
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            Panic Flatten
          </Button>
        )}
      </div>
    </>
  );
});
