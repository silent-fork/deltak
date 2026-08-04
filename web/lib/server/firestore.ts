import "server-only";

/**
 * Firestore's Document REST API — a thin `fetch` wrapper, not the
 * `firebase-admin` SDK (see `.env.example`'s Discuss section for why). Two
 * consequences of that choice, both deliberate:
 *
 *  - Every call here is scoped by whichever caller's ID token it's given
 *    (`idToken` on every function below, optional only where a route reads
 *    genuinely public data). There is no service-role bypass the way
 *    `lib/supabase.ts` has one — Firestore Security Rules
 *    (`firestore.rules` in the repo root) are what actually decide whether a
 *    request is allowed, the same rules a browser-side Firestore SDK call
 *    would be checked against. This file cannot see anything the rules
 *    don't already permit for that token.
 *  - Firestore's REST format is not plain JSON: every field value is
 *    wrapped (`{ stringValue: "x" }`, `{ integerValue: "5" }`, ...). The
 *    `toFields`/`fromDocument` pair below is the whole of that translation
 *    layer — small on purpose, since this only ever needs to round-trip the
 *    handful of field shapes `lib/server/forum.ts` actually uses.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export class FirestoreError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "FirestoreError";
  }
}

/* --------------------------------------------------------- value conversion */

export type FirestoreScalar = string | number | boolean | Date | null;
export type FirestoreInput = Record<string, FirestoreScalar>;

function toValue(v: FirestoreScalar): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  return { stringValue: v };
}

/** `{ fieldName: rawValue }` → the `{ fields: { fieldName: { stringValue: ... } } }` shape every write endpoint expects. */
export function toFields(input: FirestoreInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) fields[k] = toValue(v);
  return fields;
}

function fromValue(v: Record<string, unknown>): FirestoreScalar {
  if ("stringValue" in v) return v.stringValue as string;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue as number;
  if ("booleanValue" in v) return v.booleanValue as boolean;
  if ("timestampValue" in v) return new Date(v.timestampValue as string);
  return null;
}

export interface FirestoreDoc {
  /** The document's own ID — the last path segment of `name`, split out since every caller wants it. */
  id: string;
  fields: Record<string, FirestoreScalar>;
  createTime: string;
  updateTime: string;
}

/** The `{ name, fields, createTime, updateTime }` a read/write endpoint returns, flattened into plain values. */
export function fromDocument(doc: {
  name: string;
  fields?: Record<string, Record<string, unknown>>;
  createTime: string;
  updateTime: string;
}): FirestoreDoc {
  const fields: Record<string, FirestoreScalar> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) fields[k] = fromValue(v);
  return {
    id: doc.name.split("/").pop() ?? "",
    fields,
    createTime: doc.createTime,
    updateTime: doc.updateTime,
  };
}

/* -------------------------------------------------------------- primitives */

async function request(
  path: string,
  init: RequestInit & { idToken?: string } = {},
): Promise<unknown> {
  const { idToken, ...rest } = init;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers, cache: "no-store" });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new FirestoreError(body?.error?.message ?? `Firestore request failed (${res.status})`, res.status);
  }
  return body;
}

/** GET one document by its path, e.g. `forumThreads/abc123` or `forumThreads/abc123/posts/xyz`. Null on a 404, not a throw — "not found" is routine here. */
export async function getDocument(
  path: string,
  idToken?: string,
): Promise<FirestoreDoc | null> {
  try {
    const body = await request(`/${path}`, { method: "GET", idToken });
    return fromDocument(body as Parameters<typeof fromDocument>[0]);
  } catch (err) {
    if (err instanceof FirestoreError && err.status === 404) return null;
    throw err;
  }
}

/**
 * POST a new document into a collection. `docId` pins the ID (used for
 * `forumProfiles/{uid}`, keyed on the Firebase user ID rather than a random
 * one); omitted, Firestore mints one.
 */
export async function createDocument(
  collectionPath: string,
  fields: FirestoreInput,
  idToken?: string,
  docId?: string,
): Promise<FirestoreDoc> {
  const query = docId ? `?documentId=${encodeURIComponent(docId)}` : "";
  const body = await request(`/${collectionPath}${query}`, {
    method: "POST",
    body: JSON.stringify({ fields: toFields(fields) }),
    idToken,
  });
  return fromDocument(body as Parameters<typeof fromDocument>[0]);
}

/** PATCH an existing document — only the named fields change; anything else on the document is left alone. */
export async function patchDocument(
  path: string,
  fields: FirestoreInput,
  idToken?: string,
): Promise<FirestoreDoc> {
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const body = await request(`/${path}?${mask}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: toFields(fields) }),
    idToken,
  });
  return fromDocument(body as Parameters<typeof fromDocument>[0]);
}

export interface StructuredQueryOptions {
  collectionPath: string;
  /** Firestore calls this the collection ID, not the full path — the query runs relative to `parentPath` (default the database root). */
  parentPath?: string;
  where?: { field: string; op: "EQUAL" | "LESS_THAN" | "GREATER_THAN"; value: FirestoreScalar }[];
  orderBy?: { field: string; direction?: "ASCENDING" | "DESCENDING" };
  limit?: number;
}

/**
 * `runQuery` — Firestore's REST equivalent of a filtered/ordered `SELECT`.
 * Returns `[]` for an empty result set rather than the array-of-nullable
 * Firestore's raw response actually is (`[{}, {}]` with no `document` key on
 * an empty page) — every caller wants a clean list, not that plumbing.
 */
export async function runQuery(
  opts: StructuredQueryOptions,
  idToken?: string,
): Promise<FirestoreDoc[]> {
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: opts.collectionPath }],
  };
  if (opts.where?.length) {
    const filters = opts.where.map((w) => ({
      fieldFilter: {
        field: { fieldPath: w.field },
        op: w.op,
        value: toValue(w.value),
      },
    }));
    structuredQuery.where =
      filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
  }
  if (opts.orderBy) {
    structuredQuery.orderBy = [
      { field: { fieldPath: opts.orderBy.field }, direction: opts.orderBy.direction ?? "ASCENDING" },
    ];
  }
  if (opts.limit) structuredQuery.limit = opts.limit;

  const parent = opts.parentPath ? `/${opts.parentPath}` : "";
  const body = (await request(`${parent}:runQuery`, {
    method: "POST",
    body: JSON.stringify({ structuredQuery }),
    idToken,
  })) as { document?: Parameters<typeof fromDocument>[0] }[];

  return body.filter((row) => row.document).map((row) => fromDocument(row.document!));
}
