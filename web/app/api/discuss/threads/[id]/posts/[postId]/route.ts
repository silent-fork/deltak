import { NextResponse } from "next/server";

import { applyRefreshedCookie, getActiveForumSession } from "@/lib/server/firebaseAuth";
import { deletePost, ForumValidationError, updatePost } from "@/lib/server/forum";
import { FirestoreError } from "@/lib/server/firestore";
import { RateLimiter } from "@/lib/server/rateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const editLimiter = new RateLimiter([{ ms: 60_000, max: 20 }]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> },
) {
  const { id, postId } = await params;
  const session = await getActiveForumSession();
  if (!session) {
    return NextResponse.json({ detail: "Sign in to edit a post." }, { status: 401 });
  }

  const raw = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const body = String(raw?.body ?? "");

  await editLimiter.acquire();

  try {
    const post = await updatePost(id, postId, body, session.uid, session.idToken);
    return applyRefreshedCookie(NextResponse.json({ post }), session);
  } catch (err) {
    if (err instanceof ForumValidationError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof FirestoreError && err.status === 403) {
      return NextResponse.json({ detail: "Not permitted." }, { status: 403 });
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to update post." },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> },
) {
  const { id, postId } = await params;
  const session = await getActiveForumSession();
  if (!session) {
    return NextResponse.json({ detail: "Sign in to delete a post." }, { status: 401 });
  }

  await editLimiter.acquire();

  try {
    await deletePost(id, postId, session.uid, session.idToken);
    return applyRefreshedCookie(NextResponse.json({ ok: true }), session);
  } catch (err) {
    if (err instanceof ForumValidationError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof FirestoreError && err.status === 403) {
      return NextResponse.json({ detail: "Not permitted." }, { status: 403 });
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to delete post." },
      { status: 502 },
    );
  }
}
