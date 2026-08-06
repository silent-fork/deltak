"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SignalPanel } from "@/components/SignalPanel";
import { TradeBook } from "@/components/TradeBook";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { mergeBook } from "@/lib/engine/book";
import type {
  ExecutionMode,
  LedgerSnapshot,
  OptionChain,
  ScaleInDecision,
  Signal,
} from "@/lib/types";
import { useTradeArchive } from "@/lib/useTradeArchive";
import { PROTOCOL_META, cn, pnlTone, signedMoney } from "@/lib/utils";

/**
 * One frame for the position: what to take, and what is already on.
 *
 * The signal engine and the trade book are the two halves of a single decision
 * and are never read at the same instant — you size an entry, or you manage
 * what the entry became. Sharing a frame gives each of them the whole column
 * instead of half of it, and puts the ledger one click from the execute button
 * that produced it.
 */

type Deck = "signal" | "book";

/**
 * Memoized: `TradeBook` and `SignalPanel` underneath are each their own real
 * chunk of work, and this only needs to redraw when its own inputs — not
 * some unrelated part of the snapshot — actually changed. `onExecuted` and
 * `onLedgerChanged` must stay referentially stable at the call site for that
 * to mean anything.
 */
export const SignalDeck = memo(function SignalDeck({
  signal,
  mode,
  chain,
  onExecuted,
  ledger,
  scaleIn,
  onLedgerChanged,
  clientCode,
  walletResetAt,
}: {
  signal: Signal | undefined;
  mode: ExecutionMode;
  chain?: OptionChain;
  onExecuted: () => void;
  ledger: LedgerSnapshot | undefined;
  scaleIn: Record<string, ScaleInDecision>;
  onLedgerChanged: () => void;
  /** Re-syncs the archive whenever the signed-in account changes — see `useTradeArchive`. */
  clientCode: string | null;
  /** Re-syncs the archive after a paper-wallet reset — see `useTradeArchive`'s own comment. */
  walletResetAt: number | null;
}) {
  const [deck, setDeck] = useState<Deck>("signal");
  const meta = signal ? PROTOCOL_META[signal.protocol] : null;

  /**
   * Fetched here rather than inside `TradeBook`: this component mounts once
   * for the life of the page and only toggles which half of the deck is
   * showing, so the read happens on page load and never again just because
   * the operator clicked back into the book tab.
   */
  const { archive, loading: archiveLoading, error: archiveError, reload: reloadArchive } =
    useTradeArchive(clientCode, walletResetAt);
  // `TradeBook` is memoized too; wrapping `reloadArchive` here rather than
  // inline in its JSX prop keeps that identity stable across renders that
  // don't touch the archive, instead of a fresh closure defeating the memo.
  // Returns the promise rather than firing and forgetting it — TradeBook
  // awaits this after a position action so its own busy state (and the
  // spinner/disabled buttons it drives) spans the refresh too, not just
  // the action itself.
  const handleRefreshArchive = useCallback(() => reloadArchive(), [reloadArchive]);

  /**
   * The manual-close path in `TradeBook` awaits `onRefreshArchive` itself
   * after the button click resolves, which is what keeps a manually-closed
   * position from lingering as a read-only "open" ghost (its own stale
   * archive row hasn't caught up yet — see `mergeBook`'s doc comment). A
   * guard-driven close — TARGET, STOP_LOSS, DAYLIGHT_REST, INVALIDATION,
   * PANIC — runs the exact same `Ledger.close()` underneath, but from the
   * engine's own tick loop, not a button click, so nothing was ever telling
   * the archive to catch up: the live ledger dropped the position (correct,
   * immediate) while its last-known-OPEN row kept satisfying `mergeBook`'s
   * `dbOpen` fallback until the next manual refresh or a full reload. This
   * watches the live ledger's own closed list for an id that wasn't there a
   * moment ago and refreshes the archive the same way, regardless of what
   * closed it.
   */
  const knownClosedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = ledger?.closed_positions.map((p) => p.id) ?? [];
    const known = knownClosedIdsRef.current;
    const isNew = ids.some((id) => !known.has(id));
    knownClosedIdsRef.current = new Set(ids);
    if (!isNew) return;
    // Same settle delay as TradeBook's own post-action refresh: persistence
    // is fire-and-forget, so there's no signal for "the close has actually
    // landed in Supabase" beyond giving it a moment.
    const id = setTimeout(() => void reloadArchive(), 900);
    return () => clearTimeout(id);
  }, [ledger?.closed_positions, reloadArchive]);

  // The badge and the header total read the same merged book the trade tab
  // itself renders — live ledger plus whatever Supabase still holds from a
  // session this tab never saw — so a reload never drops them back to zero.
  const merged = useMemo(() => mergeBook(ledger, archive), [ledger, archive]);
  const openCount = merged.openRows.length;
  /**
   * `mergeBook` treats a not-yet-loaded archive the same as an empty one, so
   * for the moment before Supabase answers, a position open only there —
   * from a different tab or session, not this one's live ledger — is simply
   * missing, and the count/total jump upward the instant the fetch lands.
   * The live-ledger count is right immediately in the common case (a
   * position opened in this tab), so this dims rather than hides it: an
   * honest "still confirming" instead of either a wrong number or none.
   */
  const archiveReady = archive !== null;

  // A fill turns the deck to the book: the moment a position exists for the
  // underlying on screen, managing it is the live question, and the panic
  // control must not be behind a tab nobody thought to open. Scoped to this
  // signal's own underlying, not the whole ledger — otherwise a fill on
  // BANKNIFTY would yank the deck away from a NIFTY signal the operator was
  // still reading, unmounting it and losing its execution banner for nothing
  // that happened to NIFTY.
  const hasOpen = signal
    ? (ledger?.open_positions.some((p) => p.underlying === signal.underlying) ?? false)
    : false;
  useEffect(() => {
    if (hasOpen) setDeck("book");
  }, [hasOpen]);

  return (
    // Fills the column to the bottom, level with the chain beside it. Both
    // bodies scroll internally, so a long rationale or a busy book takes the
    // height rather than pushing the card past the board.
    <Card className="min-h-0 flex-1 xl:basis-0">
      <CardHeader className="shrink-0">
        <div className="flex min-w-0 items-center gap-1">
          {(
            [
              ["signal", "DeltaK Signal Engine"],
              ["book", "Trade Book"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDeck(key)}
              aria-pressed={deck === key}
              className={cn(
                "flex items-center gap-1.5 truncate rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors",
                deck === key
                  ? "border-quantum/50 bg-quantum/10 text-quantum"
                  : "border-transparent text-zinc-500 hover:text-zinc-300",
              )}
            >
              {label}
              {/* An open position is loud on the tab that manages it, whichever
                  half of the deck you are looking at. */}
              {key === "book" && openCount > 0 ? (
                <span
                  title={
                    archiveReady
                      ? undefined
                      : "Still confirming against Supabase — this count may still rise."
                  }
                  className={cn(
                    "rounded bg-rose-500/20 px-1 font-mono text-[9px] text-rose-300 transition-opacity",
                    !archiveReady && "opacity-50",
                  )}
                >
                  {openCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {deck === "signal" ? (
          meta ? (
            <Badge className={cn("shrink-0 font-semibold", meta.tone)}>
              Protocol {meta.name}
            </Badge>
          ) : null
        ) : (
          <span
            title={
              archiveReady
                ? "Open P&L — unrealised, across every live position"
                : "Still confirming against Supabase — this total may still move."
            }
            className={cn(
              "shrink-0 font-mono text-xs font-bold transition-opacity",
              pnlTone(merged.openPnl),
              !archiveReady && "opacity-50",
            )}
          >
            {signedMoney(merged.openPnl)}
          </span>
        )}
      </CardHeader>

      {deck === "signal" ? (
        <SignalPanel
          signal={signal}
          mode={mode}
          chain={chain}
          onExecuted={onExecuted}
          ledger={ledger}
        />
      ) : (
        <TradeBook
          ledger={ledger}
          scaleIn={scaleIn}
          onChanged={onLedgerChanged}
          archive={archive}
          archiveLoading={archiveLoading}
          archiveError={archiveError}
          onRefreshArchive={handleRefreshArchive}
        />
      )}
    </Card>
  );
});
