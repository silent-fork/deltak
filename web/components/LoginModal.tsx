"use client";

import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { useEngineContext } from "@/components/EngineProvider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useTurnstile } from "@/lib/useTurnstile";

export function LoginModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientCode, setClientCode] = useState("");
  const [pin, setPin] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engine = useEngineContext();
  // The same gate as the sign-in screen: the server checks both paths, so both
  // paths have to be able to answer.
  const turnstile = useTurnstile();

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
      title="SmartAPI Session"
      subtitle="Angel One · loginByPassword · session valid until midnight IST"
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Client Code">
          <Input
            value={clientCode}
            onChange={(e) => setClientCode(e.target.value.toUpperCase())}
            placeholder="A123456"
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
        <div ref={turnstile.containerRef} className="flex justify-center empty:hidden" />

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] leading-tight text-zinc-600">
            Relayed straight to Angel One. Nothing is written to disk. The API key
            lives in the server&apos;s secrets, not here.
          </p>
          <Button type="submit" variant="quantum" disabled={!valid || busy}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            {busy ? "Authenticating" : "Connect"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
