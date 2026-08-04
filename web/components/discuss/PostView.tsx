"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ArticleBody } from "@/components/discuss/ArticleBody";
import { LikeButton } from "@/components/discuss/LikeButton";
import { ReportButton } from "@/components/discuss/ReportButton";
import { RichTextEditor } from "@/components/discuss/RichTextEditor";
import { renderForumMarkdown } from "@/lib/discuss/markdown";

/**
 * One post's body plus its action row (like, edit, delete, report) — the
 * article opener and every comment both render through this, since both
 * are just a `ForumPost` under the hood. Edit and delete are the post's
 * own author only; there is no moderator UI here (Firestore Security Rules
 * already let a moderator update/soft-delete too, but nothing in this app
 * exposes that yet).
 *
 * Delete is a soft delete — the same "never truly gone" posture the rest
 * of `/discuss` already takes — so this optimistically swaps to the
 * `[deleted]` placeholder rather than removing the row outright, matching
 * what a reload will show once the server confirms it.
 */
export function PostView({
  threadId,
  postId,
  body,
  deletedAt,
  authorUid,
  viewerUid,
  likeCount,
  canLike,
  canReport,
  variant,
}: {
  threadId: string;
  postId: string;
  body: string;
  deletedAt: string | null;
  authorUid: string;
  viewerUid: string | null;
  likeCount: number;
  canLike: boolean;
  canReport: boolean;
  variant: "article" | "comment";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [deleted, setDeleted] = useState(Boolean(deletedAt));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = viewerUid !== null && viewerUid === authorUid;
  const isArticle = variant === "article";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/discuss/threads/${threadId}/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail ?? "Couldn't save the edit.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the edit.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/discuss/threads/${threadId}/posts/${postId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail ?? "Couldn't delete.");
      }
      setDeleted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  if (deleted) {
    return <p className="font-mono text-[12px] italic text-zinc-600">[deleted]</p>;
  }

  if (editing) {
    return (
      <div>
        <RichTextEditor
          value={draft}
          onChange={setDraft}
          rows={isArticle ? 14 : 4}
          maxLength={isArticle ? 20_000 : 8_000}
        />
        {error ? <p className="mt-1.5 text-[11px] leading-relaxed text-rose-400">{error}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex h-8 items-center rounded-md border border-quantum/60 bg-quantum/15 px-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(body);
              setError(null);
            }}
            className="flex h-8 items-center rounded-md border border-zinc-800 px-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {isArticle ? (
        <div className={isArticle ? "text-[15px] leading-[1.85] text-zinc-300" : undefined}>
          <ArticleBody body={body} />
        </div>
      ) : (
        <div className="text-[13.5px] leading-relaxed text-zinc-300">{renderForumMarkdown(body)}</div>
      )}
      {error ? <p className="mt-1.5 text-[11px] leading-relaxed text-rose-400">{error}</p> : null}
      <div className={`flex items-center justify-between ${isArticle ? "mt-4" : "mt-2"}`}>
        <div className="flex items-center gap-3.5">
          <LikeButton threadId={threadId} postId={postId} initialCount={likeCount} canLike={canLike} />
          {isAuthor ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-300"
            >
              Edit
            </button>
          ) : null}
          {isAuthor && !confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-600 hover:text-rose-400"
            >
              Delete
            </button>
          ) : null}
          {isAuthor && confirmingDelete ? (
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Delete this{isArticle ? " article" : ""}?
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className="text-rose-400 hover:underline disabled:opacity-50"
              >
                {busy ? "…" : "Yes"}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="hover:text-zinc-300">
                Cancel
              </button>
            </span>
          ) : null}
        </div>
        <ReportButton threadId={threadId} postId={postId} canReport={canReport} />
      </div>
    </div>
  );
}
