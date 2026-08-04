import "server-only";

import {
  createDocument,
  deleteDocument,
  FirestoreError,
  getDocument,
  patchDocument,
  runQuery,
  type FirestoreDoc,
} from "./firestore";

/**
 * `/discuss` data access — everything Firestore-shaped that the API routes
 * and server-rendered pages both need, in one place, the same role
 * `lib/supabase.ts` plays for the trading tables.
 *
 * Read is public throughout (every list/get here works with `idToken`
 * omitted) — Firestore Security Rules allow unauthenticated reads on these
 * collections by design, so threads and posts render as real server-side
 * HTML and stay indexable, not gated behind a sign-in the way the Terminal
 * is. Write always needs the caller's own ID token; there is no
 * service-role bypass here (see `firestore.ts`'s own header comment).
 */

const TITLE_MIN = 5;
const TITLE_MAX = 140;
const BODY_MIN = 2;
const BODY_MAX = 8_000;
/**
 * A "long article" thread's opening post — a write-up, not a chat message.
 * ~20,000 characters is roughly 3,500 words, generous for a deep-dive piece
 * while still bounded (Firestore documents cap at 1 MiB regardless).
 */
const ARTICLE_BODY_MAX = 20_000;
const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 40;

export class ForumValidationError extends Error {}

function assertLen(value: string, min: number, max: number, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ForumValidationError(`${label} must be ${min}–${max} characters.`);
  }
  return trimmed;
}

/* ------------------------------------------------------------- profiles */

export interface ForumProfile {
  uid: string;
  displayName: string;
  email: string;
  createdAt: string;
  postCount: number;
  role: "member" | "moderator";
}

function profileFromDoc(doc: FirestoreDoc): ForumProfile {
  const f = doc.fields;
  return {
    uid: doc.id,
    displayName: String(f.displayName ?? "Member"),
    email: String(f.email ?? ""),
    createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt ?? ""),
    postCount: Number(f.postCount ?? 0),
    role: f.role === "moderator" ? "moderator" : "member",
  };
}

export async function getForumProfile(uid: string): Promise<ForumProfile | null> {
  const doc = await getDocument(`forumProfiles/${uid}`);
  return doc ? profileFromDoc(doc) : null;
}

/**
 * `getForumProfile`, but self-healing: an account whose signup-time
 * `createForumProfile` failed (Firestore down, or its rules not yet
 * deployed — exactly what happened before this app's rules were corrected)
 * is left permanently posting as "Member" otherwise, since nothing ever
 * retries that create. Every write route calls this instead, so the first
 * post/reply after the account is actually able to write gives it a real
 * display name from then on.
 */
export async function getOrRepairForumProfile(
  uid: string,
  email: string,
  idToken: string,
): Promise<ForumProfile | null> {
  const profile = await getForumProfile(uid).catch(() => null);
  if (profile) return profile;
  const fallbackName = (email.split("@")[0] ?? "").slice(0, DISPLAY_NAME_MAX);
  if (fallbackName.length < DISPLAY_NAME_MIN) return null;
  return createForumProfile(uid, email, fallbackName, idToken).catch(() => null);
}

export async function createForumProfile(
  uid: string,
  email: string,
  displayName: string,
  idToken: string,
): Promise<ForumProfile> {
  const name = assertLen(displayName, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, "Display name");
  const doc = await createDocument(
    "forumProfiles",
    { displayName: name, email, createdAt: new Date(), postCount: 0, role: "member" },
    idToken,
    uid,
  );
  return profileFromDoc(doc);
}

/* -------------------------------------------------------------- threads */

export type ForumPostType = "discussion" | "article";

export interface ForumThread {
  id: string;
  category: string;
  title: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
  replyCount: number;
  lastActivityAt: string;
  pinned: boolean;
  locked: boolean;
  /** "article" threads render their opening post as a long-form piece, not a chat bubble. */
  postType: ForumPostType;
}

function threadFromDoc(doc: FirestoreDoc): ForumThread {
  const f = doc.fields;
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
  return {
    id: doc.id,
    category: String(f.category ?? ""),
    title: String(f.title ?? ""),
    authorUid: String(f.authorUid ?? ""),
    authorName: String(f.authorName ?? "Member"),
    createdAt: iso(f.createdAt),
    replyCount: Number(f.replyCount ?? 0),
    lastActivityAt: iso(f.lastActivityAt ?? f.createdAt),
    pinned: Boolean(f.pinned ?? false),
    locked: Boolean(f.locked ?? false),
    postType: f.postType === "article" ? "article" : "discussion",
  };
}

/** Newest-active first — pinned threads are sorted client-side above the rest, not by a second query. */
export async function listThreads(category: string, limit = 40): Promise<ForumThread[]> {
  const docs = await runQuery({
    collectionPath: "forumThreads",
    where: [{ field: "category", op: "EQUAL", value: category }],
    orderBy: { field: "lastActivityAt", direction: "DESCENDING" },
    limit,
  });
  return docs.map(threadFromDoc);
}

export async function getThread(threadId: string): Promise<ForumThread | null> {
  const doc = await getDocument(`forumThreads/${threadId}`);
  return doc ? threadFromDoc(doc) : null;
}

export async function createThread(
  category: string,
  title: string,
  body: string,
  author: { uid: string; name: string },
  idToken: string,
  postType: ForumPostType = "discussion",
): Promise<{ thread: ForumThread; post: ForumPost }> {
  const cleanTitle = assertLen(title, TITLE_MIN, TITLE_MAX, "Title");
  const cleanBody =
    postType === "article"
      ? assertLen(body, BODY_MIN, ARTICLE_BODY_MAX, "Article")
      : assertLen(body, BODY_MIN, BODY_MAX, "Post");
  const now = new Date();

  const threadDoc = await createDocument(
    "forumThreads",
    {
      category,
      title: cleanTitle,
      authorUid: author.uid,
      authorName: author.name,
      createdAt: now,
      replyCount: 0,
      lastActivityAt: now,
      pinned: false,
      locked: false,
      postType,
    },
    idToken,
  );

  const postDoc = await createDocument(
    `forumThreads/${threadDoc.id}/posts`,
    { body: cleanBody, authorUid: author.uid, authorName: author.name, createdAt: now, editedAt: null, deletedAt: null, likeCount: 0 },
    idToken,
  );

  await bumpPostCount(author.uid, idToken);

  return { thread: threadFromDoc(threadDoc), post: postFromDoc(postDoc, threadDoc.id) };
}

/* ---------------------------------------------------------------- posts */

export interface ForumPost {
  id: string;
  threadId: string;
  body: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  likeCount: number;
}

function postFromDoc(doc: FirestoreDoc, threadId: string): ForumPost {
  const f = doc.fields;
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
  return {
    id: doc.id,
    threadId,
    body: String(f.body ?? ""),
    authorUid: String(f.authorUid ?? ""),
    authorName: String(f.authorName ?? "Member"),
    createdAt: iso(f.createdAt),
    editedAt: f.editedAt ? iso(f.editedAt) : null,
    deletedAt: f.deletedAt ? iso(f.deletedAt) : null,
    likeCount: Number(f.likeCount ?? 0),
  };
}

export async function listPosts(threadId: string, limit = 200): Promise<ForumPost[]> {
  const docs = await runQuery({
    collectionPath: "posts",
    parentPath: `forumThreads/${threadId}`,
    orderBy: { field: "createdAt", direction: "ASCENDING" },
    limit,
  });
  return docs.map((d) => postFromDoc(d, threadId));
}

export async function createPost(
  threadId: string,
  body: string,
  author: { uid: string; name: string },
  idToken: string,
): Promise<ForumPost> {
  const thread = await getThread(threadId);
  if (!thread) throw new ForumValidationError("Thread not found.");
  if (thread.locked) throw new ForumValidationError("This thread is locked.");
  const cleanBody = assertLen(body, BODY_MIN, BODY_MAX, "Reply");
  const now = new Date();

  const postDoc = await createDocument(
    `forumThreads/${threadId}/posts`,
    { body: cleanBody, authorUid: author.uid, authorName: author.name, createdAt: now, editedAt: null, deletedAt: null, likeCount: 0 },
    idToken,
  );

  // Best-effort, read-then-write counters — not atomic under concurrent
  // replies (a rare race loses at most an exact count by one, self-corrects
  // on the next reply), which is a fine trade for staying on plain PATCH
  // instead of Firestore's separate field-transform commit API for a v1
  // forum's traffic.
  await patchDocument(
    `forumThreads/${threadId}`,
    { replyCount: thread.replyCount + 1, lastActivityAt: now },
    idToken,
  ).catch(() => undefined);
  await bumpPostCount(author.uid, idToken);

  return postFromDoc(postDoc, threadId);
}

async function bumpPostCount(uid: string, idToken: string): Promise<void> {
  const profile = await getForumProfile(uid);
  if (!profile) return;
  await patchDocument(`forumProfiles/${uid}`, { postCount: profile.postCount + 1 }, idToken).catch(
    () => undefined,
  );
}

/**
 * Like/unlike, toggled from whichever state the caller's own `likes/{uid}`
 * doc is actually in — not from anything the client claims, since the
 * client never learns "did I already like this" on page load (see
 * `LikeButton`'s own comment for why that read is skipped). The doc's mere
 * existence is the fact being toggled; `likeCount` on the post itself is a
 * denormalized read-then-write count for cheap display, same trade as
 * `replyCount`/`postCount` elsewhere in this file.
 */
export async function toggleLike(
  threadId: string,
  postId: string,
  uid: string,
  idToken: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const likePath = `forumThreads/${threadId}/posts/${postId}/likes/${uid}`;
  const postPath = `forumThreads/${threadId}/posts/${postId}`;
  const existing = await getDocument(likePath, idToken);
  const post = await getDocument(postPath);
  const currentCount = post ? Number(post.fields.likeCount ?? 0) : 0;

  if (existing) {
    await deleteDocument(likePath, idToken);
    const likeCount = Math.max(0, currentCount - 1);
    await patchDocument(postPath, { likeCount }, idToken).catch(() => undefined);
    return { liked: false, likeCount };
  }

  await createDocument(`forumThreads/${threadId}/posts/${postId}/likes`, { createdAt: new Date() }, idToken, uid);
  const likeCount = currentCount + 1;
  await patchDocument(postPath, { likeCount }, idToken).catch(() => undefined);
  return { liked: true, likeCount };
}

/* -------------------------------------------------------------- reports */

export async function reportPost(
  threadId: string,
  postId: string,
  reason: string,
  reporterUid: string,
  idToken: string,
): Promise<void> {
  const cleanReason = assertLen(reason, 3, 500, "Report reason");
  await createDocument(
    "forumReports",
    {
      postPath: `forumThreads/${threadId}/posts/${postId}`,
      threadId,
      postId,
      reporterUid,
      reason: cleanReason,
      createdAt: new Date(),
      resolved: false,
    },
    idToken,
  );
}

export { FirestoreError };
