import { NextResponse } from "next/server";

import { applyRefreshedCookie, getActiveForumSession } from "@/lib/server/firebaseAuth";
import { createPost, ForumValidationError, getForumProfile, listPosts } from "@/lib/server/forum";
import { FirestoreError } from "@/lib/server/firestore";
import { RateLimiter } from "@/lib/server/rateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const posts = await listPosts(id);
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to load replies." },
      { status: 502 },
    );
  }
}

/** Replies are the forum's normal traffic — a looser budget than starting a new thread. */
const replyLimiter = new RateLimiter([{ ms: 60_000, max: 15 }]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getActiveForumSession();
  if (!session) {
    return NextResponse.json({ detail: "Sign in to reply." }, { status: 401 });
  }

  const raw = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const body = String(raw?.body ?? "");

  await replyLimiter.acquire();

  try {
    const profile = await getForumProfile(session.uid);
    const post = await createPost(
      id,
      body,
      { uid: session.uid, name: profile?.displayName ?? "Member" },
      session.idToken,
    );
    return applyRefreshedCookie(NextResponse.json({ post }, { status: 201 }), session);
  } catch (err) {
    if (err instanceof ForumValidationError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof FirestoreError && err.status === 403) {
      return NextResponse.json({ detail: "Not permitted." }, { status: 403 });
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to post reply." },
      { status: 502 },
    );
  }
}
