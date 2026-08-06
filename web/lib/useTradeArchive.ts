"use client";

import { useCallback, useEffect, useState } from "react";

import { archiveRowToPosition, type ArchiveRow } from "@/lib/engine/book";
import type { Position } from "@/lib/types";
import { api } from "@/lib/api";

/**
 * What Supabase holds for this account — every session that ever wrote to it,
 * not just this tab's.
 *
 * Owned by whichever component mounts once for the life of the page (the
 * deck, not the tab inside it), so switching between the signal panel and the
 * trade book — which mounts and unmounts the book — re-fetches nothing. The
 * read happens once, on load, the way the "Synced with Supabase" caption
 * beneath the tabs already promises — and again whenever `clientCode`
 * changes, since `/api/history` scopes by the session cookie: switching
 * broker (or account) inside the same tab without a full reload would
 * otherwise leave the *previous* session's archive sitting here forever,
 * mixing one broker's history into another's book.
 *
 * `resetSignal` covers the one other case a client-code change doesn't: a
 * paper-wallet reset (triggered from `UserPill`, a sibling of whatever owns
 * this hook) deletes every row this archive already fetched. Without a
 * second trigger to re-fetch on, the already-loaded (now-deleted) trades —
 * and their booked P&L — kept showing here until the next manual refresh,
 * even though the ledger's own capital had already gone back to starting.
 * Pass `engine.walletResetAt` through; any value that changes on reset works.
 */
export function useTradeArchive(clientCode?: string | null, resetSignal?: unknown) {
  const [archive, setArchive] = useState<Position[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.history("positions", { limit: "100" });
      const list = Array.isArray(rows) ? (rows as ArchiveRow[]) : [];
      setArchive(list.map(archiveRowToPosition));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync trade history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, clientCode, resetSignal]);

  return { archive, loading, error, reload };
}
