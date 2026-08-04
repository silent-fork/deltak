"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { RichTextEditor } from "@/components/discuss/RichTextEditor";

type PostType = "discussion" | "article";

/** Inline, not a modal — a category page with zero threads yet has nothing else competing for the space. */
export function NewThreadForm({ category }: { category: string }) {
  const [open, setOpen] = useState(false);
  const [postType, setPostType] = useState<PostType>("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isArticle = postType === "article";
  const bodyMax = isArticle ? 20_000 : 8_000;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discuss/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, body, postType }),
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
      <div className="flex items-center gap-1 self-start rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5 font-mono text-[10px] uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setPostType("discussion")}
          className={`rounded px-2.5 py-1 transition-colors ${
            !isArticle ? "bg-quantum/15 text-quantum" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Discussion
        </button>
        <button
          type="button"
          onClick={() => setPostType("article")}
          className={`rounded px-2.5 py-1 transition-colors ${
            isArticle ? "bg-quantum/15 text-quantum" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Long article
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={isArticle ? "Article headline" : "Thread title"}
        maxLength={140}
        required
        className="h-9 rounded-md border border-zinc-700 bg-zinc-900/90 px-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-quantum/50"
      />
      <RichTextEditor
        value={body}
        onChange={setBody}
        placeholder={
          isArticle
            ? "Write the full piece — analysis, a deep dive, a guide. Blank lines start new paragraphs."
            : "What do you want to discuss?"
        }
        maxLength={bodyMax}
        rows={isArticle ? 16 : 4}
      />
      {isArticle ? (
        <p className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
          {body.trim().length ? body.trim().split(/\s+/).length : 0} words · up to{" "}
          {bodyMax.toLocaleString("en-IN")} characters
        </p>
      ) : null}
      {error ? <p className="text-[11px] leading-relaxed text-rose-400">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex h-9 items-center gap-1.5 rounded-md border border-quantum/60 bg-quantum/15 px-4 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25 disabled:opacity-50"
        >
          {busy ? "Posting…" : isArticle ? "Publish article" : "Post thread"}
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
