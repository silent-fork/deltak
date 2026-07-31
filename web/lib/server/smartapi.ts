import "server-only";

/**
 * Angel One SmartAPI v2.0 client for route handlers.
 *
 * Serverless functions are stateless, so there is no long-lived session object
 * here as there was in the Python engine. Instead:
 *
 *  - `DK_API_KEY` lives in the server environment and never leaves it for REST
 *    calls (it is separately exposed to the browser for the market-data
 *    WebSocket — see the login route for why, and what that does and does not
 *    grant).
 *  - The `jwtToken` — the credential that can place orders — is returned to the
 *    caller only inside an httpOnly cookie, so page JavaScript cannot read it.
 */

const API_ROOT = "https://apiconnect.angelone.in";
export const LOGIN_URL = `${API_ROOT}/rest/auth/angelbroking/user/v1/loginByPassword`;
export const REFRESH_URL = `${API_ROOT}/rest/auth/angelbroking/jwt/v1/generateTokens`;
export const PROFILE_URL = `${API_ROOT}/rest/secure/angelbroking/user/v1/getProfile`;
export const RMS_URL = `${API_ROOT}/rest/secure/angelbroking/user/v1/getRMS`;
export const PLACE_ORDER_URL = `${API_ROOT}/rest/secure/angelbroking/order/v1/placeOrder`;

export const API_KEY = process.env.DK_API_KEY ?? "";
export const CLIENT_LOCAL_IP = process.env.DK_CLIENT_LOCAL_IP ?? "127.0.0.1";
export const CLIENT_PUBLIC_IP = process.env.DK_CLIENT_PUBLIC_IP ?? "127.0.0.1";
export const MAC_ADDRESS = process.env.DK_MAC_ADDRESS ?? "00:00:00:00:00:00";

export class SmartApiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SmartApiError";
  }
}

export function smartApiHeaders(jwt?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": CLIENT_LOCAL_IP,
    "X-ClientPublicIP": CLIENT_PUBLIC_IP,
    "X-MACAddress": MAC_ADDRESS,
    "X-PrivateKey": API_KEY,
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  return headers;
}

/** Normalise Angel One's `{status, message, errorcode, data}` envelope. */
export async function smartApiCall<T = Record<string, unknown>>(
  url: string,
  init: { method: "GET" | "POST"; body?: unknown; jwt?: string },
): Promise<T> {
  if (!API_KEY) {
    throw new SmartApiError(
      "Server is not configured with a SmartAPI key. Set DK_API_KEY in the deployment's environment.",
      503,
    );
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: smartApiHeaders(init.jwt),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch (err) {
    throw new SmartApiError(
      `SmartAPI transport error: ${err instanceof Error ? err.message : "unreachable"}`,
    );
  }

  let payload: {
    status?: boolean;
    message?: string;
    errorcode?: string;
    data?: unknown;
  };
  try {
    payload = await res.json();
  } catch {
    throw new SmartApiError(`SmartAPI returned non-JSON (HTTP ${res.status})`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new SmartApiError(payload.message ?? "SmartAPI session expired", 401, payload.errorcode);
  }
  if (!payload.status) {
    throw new SmartApiError(
      payload.message ?? "SmartAPI request rejected",
      502,
      payload.errorcode,
    );
  }
  return (payload.data ?? {}) as T;
}

/* ----------------------------------------------------------- session cookie */

export const SESSION_COOKIE = "dk_session";

export interface ServerSession {
  jwtToken: string;
  refreshToken: string;
  clientCode: string;
}

export function encodeSession(s: ServerSession): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

export function decodeSession(raw: string | undefined): ServerSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.jwtToken === "string" && typeof parsed?.clientCode === "string") {
      return parsed as ServerSession;
    }
  } catch {
    /* malformed cookie — treat as signed out */
  }
  return null;
}
