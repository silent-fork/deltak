import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Delta-K · Auth Callback",
};

/**
 * Landing page for the Redirect URL registered on the Angel One SmartAPI app.
 *
 * Delta-K authenticates through `loginByPassword` (client code + PIN + TOTP),
 * so this route is never part of the normal session flow — Angel One simply
 * requires the app registration to carry a valid redirect target. It exists so
 * that URL resolves to something real instead of a 404.
 */
export default function AuthCallbackPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const authCode = searchParams.auth_code ?? searchParams.request_token;
  const state = searchParams.state;

  return (
    <main className="dk-grid-bg flex min-h-screen items-center justify-center p-6">
      <div className="dk-panel w-full max-w-lg p-6">
        <div className="flex items-center gap-2 text-quantum">
          <ShieldCheck className="h-4 w-4" />
          <h1 className="text-xs font-semibold uppercase tracking-[0.2em]">
            SmartAPI Redirect Endpoint
          </h1>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Delta-K Terminal establishes its session with{" "}
          <span className="font-mono text-zinc-200">loginByPassword</span> —
          client code, PIN and the six-digit TOTP from your authenticator app.
          This redirect target exists only to satisfy the Angel One app
          registration form; no token is exchanged here.
        </p>

        {authCode ? (
          <div className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            Angel One returned a publisher auth code
            {state ? ` (state: ${String(state)})` : ""}. Delta-K does not consume
            it — sign in from the terminal header instead.
          </div>
        ) : null}

        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-md border border-quantum/60 bg-quantum/15 px-4 text-xs font-medium uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25"
        >
          Return to terminal
        </Link>
      </div>
    </main>
  );
}
