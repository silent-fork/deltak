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
  Position,
  RiskEvent,
  Signal,
  UserProfile,
} from "./types";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : typeof body === "string" && body
          ? body
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

  rms: () =>
    request<{ net: number; available_cash: number; utilised_debits: number }>("/api/rms"),

  placeOrder: (payload: {
    trading_symbol: string;
    symbol_token: string;
    transaction_type: "BUY" | "SELL";
    quantity: number;
    order_type?: "MARKET" | "LIMIT";
    price?: number;
  }) =>
    request<{ ok: boolean; order_id: string | null; quantity: number }>("/api/order", {
      method: "POST",
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
    /** What the paired phone polls — never touches Angel One. */
    state: () => request<MobileStateResponse>("/api/mobile/state"),
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
