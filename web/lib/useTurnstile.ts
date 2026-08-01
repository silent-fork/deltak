"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile, run without ever asking the operator to do anything.
 *
 * The widget is rendered in `interaction-only` appearance and `execute` mode:
 * nothing is drawn, nothing is clicked, and the challenge runs when the sign-in
 * form asks it to. The operator sees the login button go to a spinner half a
 * second earlier than it otherwise would. Only if Cloudflare decides a visitor
 * genuinely has to prove something does a widget appear — which is why the
 * container is rendered into the form rather than hidden off-screen: on the
 * rare occasion it shows up, it belongs where the person is looking.
 *
 * The token this produces is single-use and short-lived. It is fetched per
 * submission, never cached across one.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_DK_TURNSTILE_SITE_KEY ?? "";

/** Must agree with the server's read of the same variable. */
const ENABLED = !["0", "false", "off"].includes(
  (process.env.NEXT_PUBLIC_DK_TURNSTILE_ENABLED ?? "").trim().toLowerCase(),
);

export const turnstileActive = ENABLED && Boolean(SITE_KEY);

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * How long to wait for a verdict before giving up.
 *
 * A challenge that never answers — a blocked script, a captive network — must
 * not leave the operator holding a spinner on a market that is moving. The
 * submission goes ahead without a token; the server decides what that is worth.
 */
const EXECUTE_TIMEOUT_MS = 12_000;

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: Record<string, unknown>,
  ): string | undefined;
  execute(widgetId: string, options?: Record<string, unknown>): void;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

/** One script tag per document, however many forms ask for it. */
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    const el = existing ?? document.createElement("script");
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => reject(new Error("Turnstile failed to load")));
    if (!existing) {
      el.src = SCRIPT_SRC;
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    }
  }).catch((err) => {
    // Let the next attempt retry rather than caching the failure forever.
    scriptPromise = null;
    throw err;
  });

  return scriptPromise;
}

export interface Turnstile {
  /** Attach to an element inside the form; stays empty unless a challenge shows. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Run the challenge and return its token, or null if verification is off,
   * unavailable, or took too long. Never throws — a sign-in must not be lost to
   * the thing standing in front of it.
   */
  execute: () => Promise<string | null>;
  /** True once the widget is rendered and can be executed without a wait. */
  ready: boolean;
}

export function useTurnstile(): Turnstile {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const pendingRef = useRef<((token: string | null) => void) | null>(null);
  const [ready, setReady] = useState(false);

  /** Settle whichever submission is waiting, exactly once. */
  const settle = useCallback((token: string | null) => {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    resolve?.(token);
  }, []);

  useEffect(() => {
    if (!turnstileActive) return;
    let cancelled = false;

    void loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        const id = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          // Never draw anything unless a human is genuinely required.
          appearance: "interaction-only",
          execution: "execute",
          theme: "dark",
          callback: (token: string) => settle(token),
          "error-callback": () => settle(null),
          "timeout-callback": () => settle(null),
          "expired-callback": () => {
            if (widgetRef.current) window.turnstile?.reset(widgetRef.current);
          },
        });
        widgetRef.current = id ?? null;
        if (id) setReady(true);
      })
      .catch(() => {
        // The gate could not be built. Sign-in still works; the server decides
        // whether a tokenless attempt is acceptable.
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
      settle(null);
      const id = widgetRef.current;
      widgetRef.current = null;
      if (id) window.turnstile?.remove(id);
    };
  }, [settle]);

  const execute = useCallback(async (): Promise<string | null> => {
    if (!turnstileActive) return null;
    const id = widgetRef.current;
    if (!id || !window.turnstile) return null;

    // Each submission gets a fresh challenge; a stale token is a rejected one.
    window.turnstile.reset(id);

    return new Promise<string | null>((resolve) => {
      let done = false;
      const finish = (token: string | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(token);
      };
      const timer = setTimeout(() => finish(null), EXECUTE_TIMEOUT_MS);
      pendingRef.current = finish;
      window.turnstile?.execute(id);
    });
  }, []);

  return { containerRef, execute, ready };
}
