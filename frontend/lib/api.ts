import type {
  EngineSnapshot,
  EngineStatus,
  ExecutionMode,
  LedgerSnapshot,
  OrderResult,
  SessionStatus,
  SizingResult,
} from "./types";

/**
 * All calls go to same-origin `/api/*`, which `next.config.mjs` rewrites to the
 * FastAPI engine. Keeping one origin means EventSource works without CORS.
 */
const BASE = "";

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
  const res = await fetch(`${BASE}${path}`, {
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

export const api = {
  status: () => request<EngineStatus>("/api/status"),
  snapshot: () => request<EngineSnapshot>("/api/snapshot"),
  portfolio: () => request<LedgerSnapshot>("/api/portfolio"),

  initMaster: (force = false) =>
    request<Record<string, unknown>>(`/api/master/init?force=${force}`),

  login: (payload: {
    client_code: string;
    pin: string;
    api_key: string;
    totp: string;
    state?: string;
  }) =>
    request<SessionStatus>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  logout: () => request<SessionStatus>("/api/auth/logout", { method: "POST" }),

  authStatus: () => request<SessionStatus>("/api/auth/status"),

  setMode: (mode: ExecutionMode) =>
    request<{ mode: ExecutionMode }>("/api/mode", {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),

  calculateSize: (payload: {
    underlying: string;
    stop_loss_points: number;
    capital?: number;
    risk_pct?: number;
    lot_size?: number;
    entry_price?: number;
  }) =>
    request<SizingResult>("/api/calculate-size", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  executeSignal: (payload: {
    underlying: string;
    lots?: number;
    override?: boolean;
  }) =>
    request<OrderResult>("/api/order/from-signal", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  exitPosition: (position_id: string, reason = "MANUAL") =>
    request<OrderResult>("/api/order/exit", {
      method: "POST",
      body: JSON.stringify({ position_id, reason }),
    }),

  scaleOut: (position_id: string, fraction = 0.5) =>
    request<OrderResult>("/api/order/scale-out", {
      method: "POST",
      body: JSON.stringify({ position_id, fraction }),
    }),

  panicExit: () =>
    request<OrderResult[]>("/api/order/panic-exit", { method: "POST" }),

  setRisk: (payload: { risk_pct?: number; paper_capital?: number }) =>
    request<{ risk_pct: number; capital: number }>("/api/risk-settings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  resetPaper: () =>
    request<LedgerSnapshot>("/api/paper/reset", { method: "POST" }),
};
