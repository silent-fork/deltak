import type {
  BatchResponse,
  Broker,
  BuildupResponse,
  CandleResponse,
  ExecutionMode,
  HolidayResponse,
  MarginResponse,
  OiResponse,
  PcrResponse,
  PendingEntry,
  Position,
  RiskEvent,
  Signal,
  UserProfile,
} from "./types";
import type { VolatilityDeskResponse } from "./tools/volatilityDeskTypes";

/**
 * Client for this app's own route handlers.
 *
 * There is no external backend: every call here hits a Next.js route in the same
 * deployment. The handlers exist only for work the browser must not or cannot do
 * — anything needing the SmartAPI key or the order-placing JWT, and the 40 MB
 * scrip-master download.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * `timeoutMs` is opt-in per call, not a global default — every other caller
 * here relies on the browser's own (much longer) fetch timeout and nothing
 * about that needs to change. It exists for the mobile companion's poll
 * loop specifically: with no cap, a hung connection there left the boot
 * screen spinning forever (see `MobileCompanion.tsx`'s own poll effect).
 */
async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
      signal: controller?.signal ?? init?.signal,
    });
  } catch (err) {
    if (controller?.signal.aborted) {
      throw new ApiError("Timed out reaching the server.", 0);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown = null;
  // A non-JSON body past this point is never our own route's own output —
  // every handler in this app answers in JSON, so anything else is a proxy
  // or gateway in front of it (Cloudflare's own HTML error pages have shown
  // up here on a 502) talking past the app entirely. That text is never fit
  // to show a user or throw as an `Error` message: unbounded, unstyled
  // upstream markup, not a description of what actually went wrong.
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `Request failed (${res.status})`;
    throw new ApiError(detail, res.status);
  }
  return body as T;
}

/** `/api/auth/session` — the same shape as a login, plus how it was resolved. */
export interface SessionResponse {
  authenticated: boolean;
  broker?: Broker;
  client_code?: string;
  feed_token?: string;
  api_key?: string;
  login_time?: string;
  /** Who is signed in — from `getProfile` (Angel One) or the token response (Dhan), or the last one stored for them. */
  profile?: UserProfile | null;
  /** The broker could not be reached; the cookie is being trusted for now. */
  stale?: boolean;
  /** New tokens were minted from the refresh token. Angel One only — Dhan has no refresh path. */
  refreshed?: boolean;
  reason?: string | null;
}

export interface LoginResponse {
  authenticated: boolean;
  broker: Broker;
  client_code: string;
  /** Market-data credentials — the browser opens its own feed socket. Dhan's `api_key` is always empty; its `feed_token` doubles as the trading-capable access token. */
  feed_token: string;
  api_key: string;
  state: string | null;
  login_time: string;
  /** Null when the profile call failed — a login is not held up for it. */
  profile: UserProfile | null;
}

/**
 * A failed sign-in, in the operator's language rather than the broker's.
 *
 * `/api/auth/login` classifies a rejected TOTP/PIN/client code as 400/401/403
 * (see `statusForErrorCode` in `lib/server/dhan.ts` and the 401/403 branch in
 * `lib/server/smartapi.ts`'s `smartApiCall`) — that's the one case with a
 * specific, actionable message. Everything else (a timed-out upstream, a
 * gateway 502, a bare network failure, Turnstile rejecting the attempt as
 * non-human) is not a credentials problem and must not be reported as one:
 * telling someone to re-check a PIN that was never wrong sends them
 * troubleshooting the wrong thing. None of these branches ever surface
 * `err.message` itself — that string is whatever the broker or a proxy in
 * front of it happened to say, unbounded and never meant for a screen.
 */
export function describeLoginError(err: unknown, broker: Broker): string {
  const brokerName = broker === "dhan" ? "Dhan" : "Angel One";
  if (err instanceof ApiError) {
    if ([400, 401, 403].includes(err.status)) {
      return "Invalid credentials. Check your Client ID, PIN and TOTP, then try again.";
    }
    if (err.status === 429) {
      return "Too many attempts — please wait a moment and try again.";
    }
    if (err.status === 0) {
      return "Timed out reaching the server. Check your connection and try again.";
    }
  }
  return `Couldn't reach ${brokerName} right now. Please try again in a moment.`;
}

export const api = {
  /** Index-option slice of the scrip master, projected server-side. */
  master: (broker: Broker = "angelone") =>
    request<unknown>(`/api/master?broker=${broker}`),

  /**
   * No api_key in the payload: the SmartAPI key (Angel One) is a deployment
   * secret read from the server environment, so it never crosses the wire on
   * the way in. Dhan takes the same client-code + PIN + TOTP shape.
   */
  login: (payload: {
    broker?: Broker;
    client_code: string;
    pin: string;
    totp: string;
    state?: string;
    /** Cloudflare Turnstile proof. Absent when verification is switched off. */
    turnstile_token?: string;
  }) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * Whether the httpOnly cookie still represents a live broker session. Called
   * on load — the JWT survives a refresh even though page state does not.
   */
  session: () => request<SessionResponse>("/api/auth/session"),

  logout: () => request<{ authenticated: boolean }>("/api/auth/logout", { method: "POST" }),

  /** The signed-in operator, refreshed on demand. Scoped to the session cookie. */
  profile: () =>
    request<{ profile: UserProfile; stale?: boolean }>("/api/auth/profile"),

  /**
   * Correct this terminal's stored email or mobile number.
   *
   * Angel One's API has no endpoint that accepts either — they come back
   * read-only from `getProfile` — so this edits only what the terminal keeps.
   * An empty string clears the field; an omitted key leaves it untouched.
   */
  updateProfile: (payload: { email?: string; mobile_no?: string }) =>
    request<{ profile: UserProfile }>("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  /**
   * Best-effort append; callers must not await this on a trading path.
   *
   * Rows must already be in table shape — see `lib/engine/persist.ts`. The
   * account a trade belongs to is stamped by the route from the session cookie,
   * so it is neither needed nor accepted here.
   */
  persist: (resource: "positions" | "orders" | "events", rows: unknown[]) =>
    request<{ persisted: number }>("/api/persist", {
      method: "POST",
      body: JSON.stringify({ resource, rows }),
    }),

  /**
   * Best-effort wallet checkpoint; same "callers must not await this on a
   * trading path" rule as `persist`. The account is stamped from the session
   * cookie — see `/api/wallet`'s own comment.
   */
  persistWallet: (wallet: { capital: number; charges: number; realised: number }) =>
    request<{ ok: boolean }>("/api/wallet", {
      method: "POST",
      body: JSON.stringify(wallet),
    }),

  /**
   * Angel One historical and market-data reads. Routed through the server for
   * the same reason orders are: the calls carry the session JWT, which the
   * browser is never given.
   */
  market: {
    candles: (body: unknown) =>
      request<CandleResponse>("/api/market/candles", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    oi: (body: unknown) =>
      request<OiResponse>("/api/market/oi", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    pcr: () => request<PcrResponse>("/api/market/pcr"),
    /** A whole ladder's session in one request, fanned out server-side. */
    batch: (body: unknown) =>
      request<BatchResponse>("/api/market/batch", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /** Batch margin calculator — what the broker blocks, not what it costs. */
    margin: (body: unknown) =>
      request<MarginResponse>("/api/margin", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    buildup: (body: unknown) =>
      request<BuildupResponse>("/api/market/buildup", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /** NSE's own F&O holiday calendar — not Angel One, no JWT involved. */
    holidays: () => request<HolidayResponse>("/api/market/holidays"),
  },

  tools: {
    /** OI buildup, per-index PCR/max pain, and India VIX — public NSE data, no broker session involved. */
    volatilityDesk: () => request<VolatilityDeskResponse>("/api/tools/volatility-desk"),
    /** India VIX's live LTP off Dhan's own market feed — Dhan sessions only, see the route's own comment. */
    vixLive: () => request<{ asOf: string; vix: VolatilityDeskResponse["vix"] }>("/api/tools/vix-live"),
  },

  history: (resource: string, params: Record<string, string> = {}) =>
    request<Position[] | RiskEvent[] | unknown[]>(
      `/api/history/${resource}?${new URLSearchParams(params).toString()}`,
    ),

  /** Wipe this account's paper-trading history — every paper position and order, open or closed. */
  resetPaper: () => request<{ ok: boolean }>("/api/paper/reset", { method: "POST" }),

  /** The read-only mobile companion — pairing from the desktop, reading back on the phone. */
  mobile: {
    /** Desktop mints a fresh QR. Requires the one active trading session. */
    pair: () =>
      request<{ claim_url: string; expires_at: string; qr_svg: string }>("/api/mobile/pair", {
        method: "POST",
      }),
    /** Desktop's throttled mirror of its own signal state — fire-and-forget. */
    push: (snapshot: unknown) =>
      request<{ ok: boolean }>("/api/mobile/push", {
        method: "POST",
        body: JSON.stringify(snapshot),
      }),
    /**
     * What the paired phone polls — never touches Angel One. Capped at 10s:
     * this runs on a tight interval forever, so a hung request must fail
     * fast rather than pile up or leave the boot screen stuck.
     */
    state: () => request<MobileStateResponse>("/api/mobile/state", undefined, 10_000),
    logout: () => request<{ paired: boolean }>("/api/mobile/logout", { method: "POST" }),
    /** Desktop's own list of every phone currently paired to this account. */
    devices: () =>
      request<{ devices: PairedDevice[]; max_devices: number }>("/api/mobile/devices"),
    /** Desktop unpairs one phone by session id, freeing a slot toward the cap. */
    removeDevice: (sessionId: string) =>
      request<{ removed: boolean }>(`/api/mobile/devices/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }),
  },
};

/** One row of `GET /api/mobile/devices`. */
export interface PairedDevice {
  session_id: string;
  paired_at: string;
  last_seen_at: string;
}

/** `GET /api/mobile/state` — the desktop's last pushed signal mirror, plus this account's positions. */
export interface MobileStateResponse {
  client_code: string;
  /** The operator's own name, same source as the desktop's `UserPill` — null for an account that never set one. */
  name: string | null;
  signal: {
    ts: string;
    mode: ExecutionMode;
    market_open: boolean;
    signals: Record<string, Signal>;
    /**
     * The desktop's own open positions, pushed on the same throttle as
     * everything else above — up to `MOBILE_PUSH_MS` fresh. Absent on older
     * cached snapshots (a phone paired before this shipped) and whenever this
     * whole `signal` object is stale or null, in which case `positions` below
     * (read straight from the DB, checkpointed independently) is the fallback.
     */
    open_positions?: Position[];
    /**
     * Resting Autopilot limit orders, pushed on the same `MOBILE_PUSH_MS`
     * throttle as everything else above. Absent on older cached snapshots
     * (a phone paired before this shipped) — treat a missing field the same
     * as an empty array, not as "the desktop has no pending orders."
     */
    pending_entries?: PendingEntry[];
    ledger: {
      capital: number;
      equity: number;
      deployed_margin: number;
      charges: number;
      open_pnl: number;
      realised_pnl: number;
      total_pnl: number;
      open_count: number;
    };
  } | null;
  signal_updated_at: string | null;
  positions: Position[];
  /**
   * The paper wallet rebuilt from its own DB checkpoint (`user_profiles.paper_*`
   * plus whatever `positions` above shows open) — always present, so the
   * wallet card has a real number the instant a phone pairs rather than
   * waiting on a live desktop push. `signal.ledger` is still the fresher of
   * the two whenever it's there; this is the fallback, same role `positions`
   * plays for `signal.open_positions`.
   */
  wallet: {
    capital: number;
    equity: number;
    deployed_margin: number;
    charges: number;
    open_pnl: number;
    realised_pnl: number;
    total_pnl: number;
  };
}
