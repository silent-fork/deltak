import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { cachedDhanProfile } from "@/lib/server/dhanProfile";
import {
  cachedProfile,
  fetchProfile,
  profileFromRow,
  rememberProfile,
} from "@/lib/server/profile";
import { SESSION_COOKIE, SmartApiError, decodeSession } from "@/lib/server/smartapi";
import { updateProfileContact } from "@/lib/supabase";

/**
 * `GET /api/auth/profile` — who is signed in, in full.
 *
 * Login and session restore already carry the profile, so the HUD rarely needs
 * this. It exists for the refresh the operator asks for by hand, and it answers
 * for the cookie's account only — the client code is read from the session, not
 * from a query parameter, so this cannot be walked to look up somebody else.
 *
 * A broker outage falls back to the stored profile rather than a failure: the
 * account's name has not changed just because Angel One is throttling.
 *
 * `PATCH` edits the email and mobile number this terminal has on file. Angel
 * One's API has no write path for either — they are the broker's KYC record —
 * so this corrects this terminal's copy only, scoped to the session cookie's
 * account the same way the read is.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "No active broker session." }, { status: 401 });
  }

  // Dhan's Data API has no live profile call to refresh against — the token
  // response at login was the only identity read there is, so this just
  // returns what login already stored.
  if (session.broker === "dhan") {
    const cached = await cachedDhanProfile(session.clientCode);
    if (cached) return NextResponse.json({ profile: cached });
    return NextResponse.json({ detail: "No stored profile for this session." }, { status: 404 });
  }

  try {
    const profile = await fetchProfile(session.jwtToken, session.clientCode);
    return NextResponse.json({ profile: await rememberProfile(profile, false) });
  } catch (err) {
    const cached = await cachedProfile(session.clientCode);
    if (cached) return NextResponse.json({ profile: cached, stale: true });

    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Profile read failed." },
      { status },
    );
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Indian mobile numbers: ten digits, first digit 6-9. Matches the client's check. */
const MOBILE_RE = /^[6-9]\d{9}$/;

/** `""` clears the field; `undefined` leaves it untouched; anything else is validated. */
function normalise(
  value: unknown,
  re: RegExp,
  label: string,
): { ok: true; value: string | null } | { ok: false; detail: string } {
  if (value === undefined) return { ok: true, value: undefined as unknown as null };
  if (typeof value !== "string") return { ok: false, detail: `${label} must be text.` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!re.test(trimmed)) return { ok: false, detail: `That doesn't look like a valid ${label.toLowerCase()}.` };
  return { ok: true, value: trimmed };
}

export async function PATCH(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "No active broker session." }, { status: 401 });
  }

  let body: { email?: unknown; mobile_no?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Malformed request body." }, { status: 400 });
  }

  const email = normalise(body.email, EMAIL_RE, "Email");
  if (!email.ok) return NextResponse.json({ detail: email.detail }, { status: 400 });

  const mobile = normalise(body.mobile_no, MOBILE_RE, "Mobile number");
  if (!mobile.ok) return NextResponse.json({ detail: mobile.detail }, { status: 400 });

  if (body.email === undefined && body.mobile_no === undefined) {
    return NextResponse.json({ detail: "Nothing to update." }, { status: 400 });
  }

  const patch: { email?: string | null; mobile_no?: string | null } = {};
  if (body.email !== undefined) patch.email = email.value;
  if (body.mobile_no !== undefined) patch.mobile_no = mobile.value;

  // The row the write returned is the answer — a second read could race another
  // session check and hand back a profile that does not reflect the edit that
  // was just made.
  try {
    const row = await updateProfileContact(session.clientCode, patch);
    return NextResponse.json({ profile: profileFromRow(row) });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Profile update failed." },
      { status: 502 },
    );
  }
}
