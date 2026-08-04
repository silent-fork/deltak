"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Segment-level error boundary for the whole `/discuss` tree — Firestore is
 * a wholly separate backend from everything else this app talks to (see
 * `firestore.ts`'s own header comment), so an outage or a misconfigured
 * deployment there gets its own branded fallback instead of Next.js's
 * generic crash screen. The category page also handles its own
 * threads-list failure inline (the rest of that page still renders
 * without it); this is the backstop for anything that doesn't — the thread
 * page's `getThread`, most of all, which has nothing left to show without it.
 */
export default function DiscussError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="dk-grid-bg flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-950 px-5 text-center">
      <AlertTriangle className="h-6 w-6 text-rose-400" />
      <p className="max-w-sm font-mono text-[12px] leading-relaxed text-rose-300">
        Discuss couldn&apos;t load right now — the forum runs on a separate backend from the rest
        of the site, and it&apos;s not answering.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="rounded border border-zinc-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-300 hover:border-quantum/50 hover:text-quantum"
        >
          Retry
        </button>
        <Link
          href="/discuss"
          className="rounded border border-zinc-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-300 hover:border-quantum/50 hover:text-quantum"
        >
          Back to Discuss
        </Link>
      </div>
    </main>
  );
}
