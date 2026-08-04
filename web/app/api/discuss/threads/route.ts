import { NextResponse } from "next/server";

import { getForumCategory } from "@/lib/content/forumCategories";
import { applyRefreshedCookie, getActiveForumSession } from "@/lib/server/firebaseAuth";
import { createThread, ForumValidationError, getOrRepairForumProfile, listThreads } from "@/lib/server/forum";
import { FirestoreError } from "@/lib/server/firestore";
import { RateLimiter } from "@/lib/server/rateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET is public and unauthenticated throughout — see forum.ts's own header comment for why. */
export async function GET(request: Request) {
  const category = new URL(request.url).searchParams.get("category") ?? "";
  if (!getForumCategory(category)) {
    return NextResponse.json({ detail: "Unknown category." }, { status: 400 });
  }
  try {
    const threads = await listThreads(category);
    return NextResponse.json({ threads });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to load threads." },
      { status: 502 },
    );
  }
}

/** New threads are cheap to spam and expensive to clean up — a tighter budget than replies get. */
const createLimiter = new RateLimiter([{ ms: 60_000, max: 5 }]);

export async function POST(request: Request) {
  const session = await getActiveForumSession();
  if (!session) {
    return NextResponse.json({ detail: "Sign in to start a thread." }, { status: 401 });
  }

  const raw = (await request.json().catch(() => null)) as {
    category?: unknown;
    title?: unknown;
    body?: unknown;
    postType?: unknown;
  } | null;
  const category = String(raw?.category ?? "");
  const title = String(raw?.title ?? "");
  const body = String(raw?.body ?? "");
  const postType = raw?.postType === "article" ? "article" : "discussion";

  if (!getForumCategory(category)) {
    return NextResponse.json({ detail: "Unknown category." }, { status: 400 });
  }

  await createLimiter.acquire();

  try {
    const profile = await getOrRepairForumProfile(session.uid, session.email, session.idToken);
    const { thread, post } = await createThread(
      category,
      title,
      body,
      { uid: session.uid, name: profile?.displayName ?? "Member" },
      session.idToken,
      postType,
    );
    return applyRefreshedCookie(NextResponse.json({ thread, post }, { status: 201 }), session);
  } catch (err) {
    if (err instanceof ForumValidationError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof FirestoreError && err.status === 403) {
      return NextResponse.json({ detail: "Not permitted." }, { status: 403 });
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to create thread." },
      { status: 502 },
    );
  }
}
