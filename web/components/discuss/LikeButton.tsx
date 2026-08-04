"use client";

import { Heart } from "lucide-react";
import { useState } from "react";

/**
 * Starts unfilled on every page load even for a post the viewer already
 * liked — finding that out would cost a Firestore read per post per page
 * view, for a fact that only matters the moment someone actually clicks.
 * The click itself is still correct either way: the server toggles off
 * whatever `likes/{uid}` doc really exists, not whatever this button
 * displayed a second ago, so a double-click still lands on "liked" only
 * once — see `toggleLike`'s own comment.
 */
export function LikeButton({
  threadId,
  postId,
  initialCount,
  canLike,
}: {
  threadId: string;
  postId: string;
  initialCount: number;
  canLike: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!canLike || busy) return;
    setBusy(true);
    // Optimistic — a like is low-stakes enough that waiting on the round
    // trip before the heart fills would read as lag, not honesty.
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));
    try {
      const res = await fetch(`/api/discuss/threads/${threadId}/posts/${postId}/like`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setLiked(Boolean(data.liked));
      setCount(Number(data.likeCount ?? count));
    } catch {
      // Roll back — the server never actually saw this toggle.
      setLiked(!nextLiked);
      setCount((c) => c - (nextLiked ? 1 : -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!canLike}
      title={canLike ? (liked ? "Unlike" : "Like") : "Sign in to like"}
      className={`flex items-center gap-1.5 font-mono text-[10px] transition-colors ${
        liked ? "text-rose-400" : "text-zinc-600 hover:text-zinc-300"
      } ${canLike ? "" : "cursor-default opacity-60"}`}
    >
      <Heart className={`h-3.5 w-3.5 transition-transform ${liked ? "scale-110 fill-rose-400" : ""}`} />
      {count > 0 ? count : null}
    </button>
  );
}
