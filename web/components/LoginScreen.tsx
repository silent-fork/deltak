"use client";

import { LockKeyhole, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BrandIcon } from "@/components/BrandIcon";
import { useEngineContext } from "@/components/EngineProvider";
import { Wordmark } from "@/components/Wordmark";
import { Input } from "@/components/ui/input";
import { describeLoginError } from "@/lib/api";
import { track } from "@/lib/analytics";
import type { Broker } from "@/lib/types";
import { turnstileActive, useTurnstile } from "@/lib/useTurnstile";

const BROKERS: { id: Broker; label: string; sub: string }[] = [
  { id: "dhan", label: "Dhan", sub: "Data API" },
  { id: "angelone", label: "Angel One", sub: "SmartAPI" },
];

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
  const [broker, setBroker] = useState<Broker>("dhan");
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
  // Destructured to a local binding: the compiler can trace a `ref={x}` prop
  // back to its own `useRef()` call through a plain local variable, but not
  // through a property access on an object returned by another hook.
  const { containerRef: turnstileContainerRef } = turnstile;

  const valid =
    clientCode.trim().length >= 3 && pin.trim().length >= 4 && /^\d{6}$/.test(totp.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    track("login_attempt", { broker });
    try {
      // Nothing is asked of the operator here: the challenge runs behind the
      // button while it spins, and the token rides along with the credentials.
      setPhase("verifying");
      const token = await turnstile.execute();
      setPhase("authenticating");
      await engine.login({
        broker,
        client_code: clientCode.trim(),
        pin: pin.trim(),
        totp: totp.trim(),
        ...(token ? { turnstile_token: token } : {}),
      });
      // The TOTP is single-use — never keep it around after submission.
      setTotp("");
      setPin("");
      // Passed explicitly rather than waiting on the ambient context effect
      // in useEngine (keyed off `session.clientCode`) to catch up — this
      // fires the instant login resolves, so the very first event of the
      // session already carries the ID Amplitude identifies the user by.
      track("login_success", { broker, client_code: clientCode.trim() });
    } catch (err) {
      setError(describeLoginError(err, broker));
      setTotp("");
      // No error detail here — a login failure reason is exactly the kind of
      // thing that shouldn't ride along into a third-party analytics event.
      track("login_failed", { broker });
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

      <div className="relative w-full max-w-[380px]">
        {/* Brand */}
        <Link href="/" className="mb-7 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
            <BrandIcon size="md" />
          </div>
          <div className="leading-none">
            <Wordmark className="text-[15px] font-semibold tracking-[0.18em]" />
            <div className="mt-1 text-[9px] uppercase tracking-[0.24em] text-zinc-500">
              Terminal · DKMS
            </div>
          </div>
        </Link>

        {/*
          The card itself — `dk-panel` is the same glass surface the home
          page's own feature/strategy cards use (blurred, soft-shadowed, a
          hairline border) rather than the sign-in form sitting bare on the
          page background.
        */}
        <div className="dk-panel relative overflow-hidden rounded-2xl p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-quantum/[0.09] blur-[70px]"
          />

          <h1 className="relative text-lg font-medium tracking-tight text-zinc-100">
            Sign in to {broker === "dhan" ? "Dhan" : "Angel One"}
          </h1>
          <p className="relative mt-1.5 text-[12px] text-zinc-500">
            {broker === "dhan" ? "Dhan Data API session" : "SmartAPI session"}
          </p>

          {/* Broker toggle — same three-field TOTP form either way, so this is the only real fork in the sign-in flow. */}
          <div className="relative mt-5 grid grid-cols-2 gap-1.5 rounded-lg border border-zinc-800/70 bg-zinc-950/50 p-1">
            {BROKERS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setBroker(b.id);
                  setError(null);
                }}
                className={`rounded-md px-2.5 py-1.5 text-left transition-all duration-150 ${
                  broker === b.id
                    ? "bg-quantum/10 text-zinc-100 shadow-[0_0_14px_-6px_rgba(0,240,255,0.45)] ring-1 ring-inset ring-quantum/40"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <div className="text-[12px] font-medium">{b.label}</div>
                <div className="text-[9px] uppercase tracking-[0.12em] opacity-70">{b.sub}</div>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="relative mt-4 space-y-4">
          <Field label={broker === "dhan" ? "Dhan Client ID" : "Client Code"}>
            <Input
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value.toUpperCase())}
              placeholder={broker === "dhan" ? "1100011234" : "A123456"}
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
          <div ref={turnstileContainerRef} className="flex justify-center empty:hidden" />

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
            {/*
              Same charging K+cursor mark the rest of the site already uses
              for "something is happening" (see `dk-charge`, `CtaLink`)
              rather than a bespoke icon per phase — one consistent loading
              language instead of two more animations to get right. The
              label beside it still says which wait this is.
            */}
            {phase ? (
              <span aria-hidden className="inline-flex h-4 w-4 shrink-0 animate-dk-charge items-center justify-center">
                <BrandIcon size="xs" />
              </span>
            ) : null}
            {phase === "verifying"
              ? "Verifying you're human"
              : phase === "authenticating"
                ? "Authenticating"
                : "Sign in"}
          </button>

          {turnstileActive ? (
            <p className="-mt-2 text-[9px] uppercase tracking-[0.14em] text-zinc-700">
              Protected by Cloudflare Turnstile
            </p>
          ) : null}
          </form>
        </div>

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
          <span>
            Credentials are relayed to {broker === "dhan" ? "Dhan" : "Angel One"} and never
            stored.
          </span>
        </div>
      </div>
    </main>
  );
}
