"use client";

import { useEffect, useMemo, useState } from "react";

import { SignalPanel } from "@/components/SignalPanel";
import { TradeBook } from "@/components/TradeBook";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { mergeBook } from "@/lib/engine/book";
import type {
  ExecutionMode,
  LedgerSnapshot,
  OptionChain,
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

export function SignalDeck({
  signal,
  mode,
  chain,
  onExecuted,
  ledger,
  onLedgerChanged,
}: {
  signal: Signal | undefined;
  mode: ExecutionMode;
  chain?: OptionChain;
  onExecuted: () => void;
  ledger: LedgerSnapshot | undefined;
  onLedgerChanged: () => void;
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
    useTradeArchive();

  // The badge and the header total read the same merged book the trade tab
  // itself renders — live ledger plus whatever Supabase still holds from a
  // session this tab never saw — so a reload never drops them back to zero.
  const merged = useMemo(() => mergeBook(ledger, archive), [ledger, archive]);
  const openCount = merged.openRows.length;
  const totalPnl = merged.openPnl + merged.bookedPnl;

  // A fill turns the deck to the book: the moment a position exists, managing
  // it is the live question, and the panic control must not be behind a tab
  // nobody thought to open.
  const hasOpen = (ledger?.open_positions.length ?? 0) > 0;
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
                <span className="rounded bg-rose-500/20 px-1 font-mono text-[9px] text-rose-300">
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
            className={cn("shrink-0 font-mono text-xs font-bold", pnlTone(totalPnl))}
          >
            {signedMoney(totalPnl)}
          </span>
        )}
      </CardHeader>

      {deck === "signal" ? (
        <SignalPanel
          signal={signal}
          mode={mode}
          chain={chain}
          onExecuted={onExecuted}
        />
      ) : (
        <TradeBook
          ledger={ledger}
          onChanged={onLedgerChanged}
          archive={archive}
          archiveLoading={archiveLoading}
          archiveError={archiveError}
          onRefreshArchive={() => void reloadArchive()}
        />
      )}
    </Card>
  );
}
