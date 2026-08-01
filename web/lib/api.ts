import type {
  BuildupResponse,
  CandleResponse,
  MarginResponse,
  OiResponse,
  PcrResponse,
  Position,
  RiskEvent,
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

export interface LoginResponse {
  authenticated: boolean;
  client_code: string;
  /** Market-data credentials — the browser opens the SmartStream socket itself. */
  feed_token: string;
  api_key: string;
  state: string | null;
  login_time: string;
}

export const api = {
  /** Index-option slice of the scrip master, projected server-side. */
  master: () => request<unknown>("/api/master"),

  /**
   * No api_key in the payload: the SmartAPI key is a deployment secret read from
   * the server environment, so it never crosses the wire on the way in.
   */
  login: (payload: { client_code: string; pin: string; totp: string; state?: string }) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  logout: () => request<{ authenticated: boolean }>("/api/auth/logout", { method: "POST" }),

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

  /** Best-effort append; callers must not await this on a trading path. */
  persist: (resource: "positions" | "orders" | "events" | "signals", rows: unknown[]) =>
    request<{ persisted: number }>("/api/persist", {
      method: "POST",
      body: JSON.stringify({ resource, rows }),
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
  },

  history: (resource: string, params: Record<string, string> = {}) =>
    request<Position[] | RiskEvent[] | unknown[]>(
      `/api/history/${resource}?${new URLSearchParams(params).toString()}`,
    ),
};
