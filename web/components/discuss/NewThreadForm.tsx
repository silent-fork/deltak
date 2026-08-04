"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Inline, not a modal — a category page with zero threads yet has nothing else competing for the space. */
export function NewThreadForm({ category }: { category: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discuss/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail ?? "Couldn't start the thread.");
      router.push(`/discuss/${category}/${data.thread.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the thread.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-md border border-quantum/50 bg-quantum/10 px-4 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/20"
      >
        New thread
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="dk-panel flex flex-col gap-2.5 rounded-lg p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Thread title"
        maxLength={140}
        required
        className="h-9 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-quantum/50"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What do you want to discuss?"
        maxLength={8000}
        required
        rows={4}
        className="resize-none rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-quantum/50"
      />
      {error ? <p className="text-[11px] leading-relaxed text-rose-400">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex h-9 items-center gap-1.5 rounded-md border border-quantum/60 bg-quantum/15 px-4 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25 disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post thread"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-9 items-center rounded-md border border-zinc-800 px-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
