"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReplyForm({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/discuss/threads/${threadId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail ?? "Couldn't post that reply.");
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="dk-panel flex flex-col gap-2.5 rounded-lg p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        maxLength={8000}
        required
        rows={3}
        className="resize-none rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-quantum/50"
      />
      {error ? <p className="text-[11px] leading-relaxed text-rose-400">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="flex h-9 w-fit items-center gap-1.5 self-end rounded-md border border-quantum/60 bg-quantum/15 px-4 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25 disabled:opacity-50"
      >
        {busy ? "Posting…" : "Reply"}
      </button>
    </form>
  );
}
