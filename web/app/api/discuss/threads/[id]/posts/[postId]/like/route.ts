import { NextResponse } from "next/server";

import { applyRefreshedCookie, getActiveForumSession } from "@/lib/server/firebaseAuth";
import { toggleLike } from "@/lib/server/forum";
import { FirestoreError } from "@/lib/server/firestore";
import { RateLimiter } from "@/lib/server/rateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A tap target, not a form submission — generous budget, still bounded against a click-spam script. */
const likeLimiter = new RateLimiter([{ ms: 60_000, max: 60 }]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> },
) {
  const { id, postId } = await params;
  const session = await getActiveForumSession();
  if (!session) {
    return NextResponse.json({ detail: "Sign in to like a post." }, { status: 401 });
  }

  await likeLimiter.acquire();

  try {
    const result = await toggleLike(id, postId, session.uid, session.idToken);
    return applyRefreshedCookie(NextResponse.json(result), session);
  } catch (err) {
    if (err instanceof FirestoreError && err.status === 403) {
      return NextResponse.json({ detail: "Not permitted." }, { status: 403 });
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to like post." },
      { status: 502 },
    );
  }
}
