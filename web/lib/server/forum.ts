import "server-only";

import {
  createDocument,
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
): Promise<{ thread: ForumThread; post: ForumPost }> {
  const cleanTitle = assertLen(title, TITLE_MIN, TITLE_MAX, "Title");
  const cleanBody = assertLen(body, BODY_MIN, BODY_MAX, "Post");
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
    },
    idToken,
  );

  const postDoc = await createDocument(
    `forumThreads/${threadDoc.id}/posts`,
    { body: cleanBody, authorUid: author.uid, authorName: author.name, createdAt: now, editedAt: null, deletedAt: null },
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
    { body: cleanBody, authorUid: author.uid, authorName: author.name, createdAt: now, editedAt: null, deletedAt: null },
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
