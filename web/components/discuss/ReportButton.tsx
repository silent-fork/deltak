"use client";

import { Flag } from "lucide-react";
import { useState } from "react";

/** Fire-and-confirm, not a modal — a report is a low-stakes, one-line action, and the reporter never sees the queue anyway (Firestore Security Rules deny reading it back to a non-moderator). */
export function ReportButton({
  threadId,
  postId,
  canReport,
}: {
  threadId: string;
  postId: string;
  /** Server-known "is anyone signed in at all" — reporting needs an account, same as replying does. */
  canReport: boolean;
}) {
  const [state, setState] = useState<"idle" | "reasoning" | "sent" | "error">("idle");
  const [reason, setReason] = useState("");

  if (!canReport) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/discuss/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, postId, reason: reason || "No reason given" }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return <span className="font-mono text-[9.5px] text-zinc-600">Reported</span>;
  }

  if (state === "reasoning") {
    return (
      <form onSubmit={submit} className="flex items-center gap-1.5">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why?"
          autoFocus
          maxLength={500}
          className="h-6 w-32 rounded border border-zinc-800 bg-zinc-950/60 px-1.5 font-mono text-[9.5px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-quantum/50"
        />
        <button type="submit" className="font-mono text-[9.5px] text-quantum hover:underline">
          Send
        </button>
      </form>
    );
  }

  return (
    <button
      onClick={() => setState("reasoning")}
      title="Report this post"
      className="flex items-center gap-1 font-mono text-[9.5px] text-zinc-700 transition-colors hover:text-rose-400"
    >
      <Flag className="h-2.5 w-2.5" />
      {state === "error" ? "Failed — retry" : "Report"}
    </button>
  );
}
