import { NextResponse } from "next/server";

import { applyRefreshedCookie, getActiveForumSession } from "@/lib/server/firebaseAuth";
import { ForumValidationError, reportPost } from "@/lib/server/forum";
import { FirestoreError } from "@/lib/server/firestore";
import { RateLimiter } from "@/lib/server/rateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportLimiter = new RateLimiter([{ ms: 60_000, max: 10 }]);

export async function POST(request: Request) {
  const session = await getActiveForumSession();
  if (!session) {
    return NextResponse.json({ detail: "Sign in to report a post." }, { status: 401 });
  }

  const raw = (await request.json().catch(() => null)) as {
    threadId?: unknown;
    postId?: unknown;
    reason?: unknown;
  } | null;
  const threadId = String(raw?.threadId ?? "");
  const postId = String(raw?.postId ?? "");
  const reason = String(raw?.reason ?? "");

  if (!threadId || !postId) {
    return NextResponse.json({ detail: "threadId and postId are required." }, { status: 400 });
  }

  await reportLimiter.acquire();

  try {
    await reportPost(threadId, postId, reason, session.uid, session.idToken);
    return applyRefreshedCookie(NextResponse.json({ ok: true }), session);
  } catch (err) {
    if (err instanceof ForumValidationError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof FirestoreError && err.status === 403) {
      return NextResponse.json({ detail: "Not permitted." }, { status: 403 });
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to report post." },
      { status: 502 },
    );
  }
}
