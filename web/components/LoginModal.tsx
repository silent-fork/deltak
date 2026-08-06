"use client";

import { ShieldAlert, Zap } from "lucide-react";
import { useState } from "react";

import { useEngineContext } from "@/components/EngineProvider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import type { Broker } from "@/lib/types";
import { useTurnstile } from "@/lib/useTurnstile";

const BROKERS: { id: Broker; label: string }[] = [
  { id: "dhan", label: "Dhan" },
  { id: "angelone", label: "Angel One" },
];

export function LoginModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [broker, setBroker] = useState<Broker>("dhan");
  const [clientCode, setClientCode] = useState("");
  const [pin, setPin] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engine = useEngineContext();
  // The same gate as the sign-in screen: the server checks both paths, so both
  // paths have to be able to answer.
  const turnstile = useTurnstile();
  // Destructured to a local binding: the compiler can trace a `ref={x}` prop
  // back to its own `useRef()` call through a plain local variable, but not
  // through a property access on an object returned by another hook — see
  // the identical destructure in `LoginScreen.tsx`.
  const { containerRef: turnstileContainerRef } = turnstile;

  const valid =
    clientCode.trim().length >= 3 &&
    pin.trim().length >= 4 &&
    /^\d{6}$/.test(totp.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await turnstile.execute();
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
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setTotp("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={broker === "dhan" ? "Dhan Session" : "SmartAPI Session"}
      subtitle={
        broker === "dhan"
          ? "Dhan · generateAccessToken · session valid 24h"
          : "Angel One · loginByPassword · session valid until midnight IST"
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-1">
          {BROKERS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBroker(b.id)}
              className={`flex-1 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors ${
                broker === b.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <Field label={broker === "dhan" ? "Dhan Client ID" : "Client Code"}>
          <Input
            value={clientCode}
            onChange={(e) => setClientCode(e.target.value.toUpperCase())}
            placeholder={broker === "dhan" ? "1100011234" : "A123456"}
            autoComplete="username"
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

        <Field
          label="TOTP"
          hint="The six digits currently shown in your authenticator app. Single-use — never stored."
        >
          <Input
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="tracking-[0.4em]"
            autoComplete="one-time-code"
          />
        </Field>

        {error ? (
          <div className="flex items-start gap-2 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-300">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Only ever occupies space if a challenge actually has to be shown. */}
        <div ref={turnstileContainerRef} className="flex justify-center empty:hidden" />

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] leading-tight text-zinc-600">
            Relayed straight to {broker === "dhan" ? "Dhan" : "Angel One"}. Nothing is
            written to disk.
          </p>
          <Button type="submit" variant="quantum" disabled={!valid || busy}>
            {/* Same charging-bolt loading glyph as everywhere else on the
                site (see `dk-charge`, `CtaLink`) rather than a bespoke key
                icon — one consistent "in progress" language, not a second
                one just for this button. */}
            {busy ? <Zap className="h-3.5 w-3.5 animate-dk-charge fill-current" /> : null}
            {busy ? "Authenticating" : "Connect"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
