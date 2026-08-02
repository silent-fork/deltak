"use client";

import { Loader2, LockKeyhole, ShieldAlert, Zap } from "lucide-react";
import { useState } from "react";

import { useEngineContext } from "@/components/EngineProvider";
import { Wordmark } from "@/components/Wordmark";
import { Input } from "@/components/ui/input";
import { turnstileActive, useTurnstile } from "@/lib/useTurnstile";

/**
 * Sign-in gate.
 *
 * The terminal is meaningless without a market feed, so rather than render a
 * grid of empty panels and a red error badge, an unauthenticated visitor gets
 * this: one card, three fields, and an honest note about where credentials go.
 */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[10px] leading-relaxed text-zinc-600">{hint}</span>
      ) : null}
    </label>
  );
}

export function LoginScreen({ simulate }: { simulate: boolean }) {
  const engine = useEngineContext();
  const [clientCode, setClientCode] = useState("");
  const [pin, setPin] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * What the button is waiting on, not just whether it's waiting. The
   * Turnstile challenge and the SmartAPI round trip are two different waits
   * with two different failure modes, and naming which one is live is more
   * honest than one "Authenticating" spinner covering both.
   */
  const [phase, setPhase] = useState<"verifying" | "authenticating" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const turnstile = useTurnstile();

  const valid =
    clientCode.trim().length >= 3 && pin.trim().length >= 4 && /^\d{6}$/.test(totp.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Nothing is asked of the operator here: the challenge runs behind the
      // button while it spins, and the token rides along with the credentials.
      setPhase("verifying");
      const token = await turnstile.execute();
      setPhase("authenticating");
      await engine.login({
        client_code: clientCode.trim(),
        pin: pin.trim(),
        totp: totp.trim(),
        ...(token ? { turnstile_token: token } : {}),
      });
      // The TOTP is single-use — never keep it around after submission.
      setTotp("");
      setPin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setTotp("");
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-zinc-950 px-5 py-10">
      {/* A single soft light source keeps the page from reading as a flat void. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[440px] w-[720px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.07] blur-[120px]"
      />
      <div aria-hidden className="dk-grid-bg pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative w-full max-w-[360px]">
        {/* Brand */}
        <div className="mb-7 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
            <Zap className="h-4 w-4 text-quantum" />
          </div>
          <div className="leading-none">
            <Wordmark className="text-[15px] font-semibold tracking-[0.18em]" />
            <div className="mt-1 text-[9px] uppercase tracking-[0.24em] text-zinc-500">
              Terminal · DKMS
            </div>
          </div>
        </div>

        <h1 className="text-lg font-medium tracking-tight text-zinc-100">
          Sign in to Angel One
        </h1>
        <p className="mt-1.5 text-[12px] text-zinc-500">SmartAPI session</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Client Code">
            <Input
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value.toUpperCase())}
              placeholder="A123456"
              autoComplete="username"
              autoFocus
              spellCheck={false}
            />
          </Field>

          <Field label="Client PIN">
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoComplete="current-password"
            />
          </Field>

          <Field label="TOTP">
            <Input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="tracking-[0.5em]"
              autoComplete="one-time-code"
            />
          </Field>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-rose-300">
              <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {/*
            Where a challenge would appear, on the rare visit that needs one.
            `empty:hidden` keeps it from reserving a gap on every other visit.
          */}
          <div ref={turnstile.containerRef} className="flex justify-center empty:hidden" />

          {/*
            A quiet button.

            This used to be the neon-cyan `quantum` variant with a glow and an
            arrow — the loudest thing on a page whose job is to be calm, and the
            same treatment the terminal reserves for live trading actions. It is
            a plain solid control now: the only thing to press on the page does
            not need decoration to be found.
          */}
          <button
            type="submit"
            disabled={!valid || busy}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 text-[13px] font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : null}
            {phase === "verifying"
              ? "Verifying you're human"
              : phase === "authenticating"
                ? "Authenticating"
                : "Sign in"}
          </button>

          {turnstileActive ? (
            <p className="-mt-2 text-center text-[9px] uppercase tracking-[0.14em] text-zinc-700">
              Protected by Cloudflare Turnstile
            </p>
          ) : null}
        </form>

        {simulate ? (
          <button
            onClick={() => engine.enterDemo()}
            className="mt-3 w-full rounded-md border border-zinc-800 py-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
          >
            Explore with a simulated feed
          </button>
        ) : null}

        {/* One line, because it is the only claim a sign-in page needs to make. */}
        <div className="mt-6 flex items-center gap-2 border-t border-zinc-900 pt-4 text-[10px] text-zinc-600">
          <LockKeyhole className="h-3 w-3 shrink-0" />
          <span>Credentials are relayed to Angel One and never stored.</span>
        </div>
      </div>
    </main>
  );
}
