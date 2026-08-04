"use client";

import { Check, Eye, EyeOff, Loader2, Lock, LogOut, Mail, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The header's sign-in state — a self-contained dropdown rather than a
 * separate `/discuss/sign-in` route, since signing in is something a reader
 * does *from* whatever thread they're already reading, not a destination of
 * its own. `router.refresh()` after a successful auth action re-renders
 * every Server Component on the page (the reply box's own "sign in to
 * reply" gate included) against the fresh cookie, without a full reload.
 */
export function AuthMenu({
  signedIn,
  displayName,
}: {
  signedIn: boolean;
  displayName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function signOut() {
    await fetch("/api/discuss/auth/logout", { method: "POST" });
    setOpen(false);
    router.refresh();
  }

  if (signedIn) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-[10.5px] text-zinc-400">
          <User className="h-3 w-3 text-quantum" />
          {displayName}
        </span>
        <button
          onClick={signOut}
          title="Sign out"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
      >
        Sign in
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="dk-panel absolute right-0 top-11 z-50 w-[336px] rounded-lg p-4">
            <AuthForms onDone={() => { setOpen(false); router.refresh(); }} />
          </div>
        </>
      ) : null}
    </div>
  );
}

const PASSWORD_MIN = 8;

function passwordChecks(password: string) {
  return [
    { label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN },
    { label: "A letter and a number", ok: /[a-zA-Z]/.test(password) && /[0-9]/.test(password) },
  ];
}

function AuthForms({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touchedPassword, setTouchedPassword] = useState(false);

  const isSignup = mode === "signup";
  const checks = passwordChecks(password);
  const passwordValid = checks.every((c) => c.ok);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isSignup && !passwordValid) {
      setTouchedPassword(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/discuss/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSignup ? { email, password, displayName } : { email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? "Something went wrong.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-3 text-[13px] font-semibold text-zinc-200">
        {isSignup ? "Create your account" : "Sign in to DeltaK"}
      </p>

      <div className="mb-3 flex gap-1 rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn(
              "flex-1 rounded px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
              mode === m ? "bg-quantum/15 text-quantum" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2.5">
        {isSignup ? (
          <div className="relative">
            <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              autoComplete="nickname"
              maxLength={40}
              required
              className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950/60 pl-8 pr-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-quantum/50"
            />
          </div>
        ) : null}

        <div className="relative">
          <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            autoComplete="email"
            required
            className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950/60 pl-8 pr-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-quantum/50"
          />
        </div>

        <div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouchedPassword(true)}
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? PASSWORD_MIN : undefined}
              required
              className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950/60 pl-8 pr-9 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-quantum/50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              title={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          {isSignup && (touchedPassword || password.length > 0) ? (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {checks.map((c) => (
                <li
                  key={c.label}
                  className={cn(
                    "flex items-center gap-1.5 font-mono text-[10px]",
                    c.ok ? "text-emerald-400" : "text-zinc-600",
                  )}
                >
                  <Check className={cn("h-3 w-3", c.ok ? "opacity-100" : "opacity-30")} />
                  {c.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {error ? <p className="text-[11px] leading-relaxed text-rose-400">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-md border border-quantum/60 bg-quantum/15 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {busy ? "One moment…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
