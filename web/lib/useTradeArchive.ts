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
 * beneath the tabs already promises.
 */
export function useTradeArchive() {
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
  }, [reload]);

  return { archive, loading, error, reload };
}
