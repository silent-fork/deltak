import "server-only";

/**
 * Cloudflare Turnstile — human verification in front of the broker login.
 *
 * The sign-in form posts a client code, a PIN and a TOTP straight through to
 * Angel One. Without a check in front of it, this deployment is a free
 * credential-stuffing endpoint against a broker: someone else's rate limit,
 * someone else's lockouts. Turnstile costs the operator nothing — the widget is
 * non-interactive, so a real person sees a spinner and nothing else — and costs
 * a script a challenge it cannot pass.
 *
 * Both keys come from the environment. The site key is public by design (it is
 * in the page); the secret never leaves the server, which is why verification
 * happens here rather than in the browser that would just be asked to lie.
 */

const SECRET = process.env.DK_TURNSTILE_SECRET_KEY ?? "";
const SITE_KEY = process.env.NEXT_PUBLIC_DK_TURNSTILE_SITE_KEY ?? "";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * The kill switch, read by both halves.
 *
 * `NEXT_PUBLIC_DK_TURNSTILE_ENABLED=0` takes the gate out of the path entirely —
 * the form stops rendering a widget and this stops checking for a token — which
 * is what an end-to-end test run against a real login needs. It is
 * `NEXT_PUBLIC_` because the browser has to make the same decision the server
 * does; get them out of step and every login fails on a token one side is not
 * producing.
 *
 * Anything other than an explicit off means on.
 */
export const turnstileEnabled = !["0", "false", "off"].includes(
  (process.env.NEXT_PUBLIC_DK_TURNSTILE_ENABLED ?? "").trim().toLowerCase(),
);

/**
 * Verification is opt-in beyond that: with no secret configured — a local
 * checkout, a preview deployment — logins proceed unchallenged rather than
 * becoming impossible. Setting the secret is what turns the gate on.
 */
export const turnstileConfigured = turnstileEnabled && Boolean(SECRET);

export interface TurnstileResult {
  ok: boolean;
  /** Operator-facing reason. Cloudflare's error codes are not that. */
  detail?: string;
  status?: number;
}

const PASS: TurnstileResult = { ok: true };

/** Cloudflare's codes, translated into something worth showing a human. */
const MESSAGES: Record<string, string> = {
  "missing-input-response": "Human verification did not complete. Try again.",
  "invalid-input-response": "Human verification failed. Try again.",
  "timeout-or-duplicate": "Human verification expired. Try again.",
  "invalid-input-secret": "Human verification is misconfigured on the server.",
  "missing-input-secret": "Human verification is misconfigured on the server.",
};

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  if (!turnstileConfigured) return PASS;

  // A secret with no site key means the form cannot produce a token and every
  // login would fail with a verification error that is really a deployment
  // error. Say which it is.
  if (!SITE_KEY) {
    return {
      ok: false,
      status: 503,
      detail:
        "Human verification is enabled but NEXT_PUBLIC_DK_TURNSTILE_SITE_KEY is not set on this deployment.",
    };
  }

  if (!token) {
    return { ok: false, status: 400, detail: MESSAGES["missing-input-response"] };
  }

  const body = new URLSearchParams({ secret: SECRET, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let payload: { success?: boolean; "error-codes"?: string[] };
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    payload = await res.json();
  } catch {
    // Cloudflare being unreachable must not become "nobody can trade today".
    // The check is a filter on automated abuse, not an authentication factor —
    // the TOTP is that, and it is still required behind this.
    return PASS;
  }

  if (payload.success) return PASS;

  const code = payload["error-codes"]?.[0] ?? "";
  return {
    ok: false,
    status: code.includes("secret") ? 503 : 403,
    detail: MESSAGES[code] ?? "Human verification failed. Try again.",
  };
}

/** The caller's address, as far as the proxy in front of us reports it. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("cf-connecting-ip");
}
