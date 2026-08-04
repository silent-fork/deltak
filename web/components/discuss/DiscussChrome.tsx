import { ArrowRight, ChevronRight, Zap } from "lucide-react";
import Link from "next/link";

import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { CtaLink } from "@/components/CtaLink";
import { Wordmark } from "@/components/Wordmark";
import { getViewerIdentity } from "@/lib/server/firebaseAuth";
import { getForumProfile } from "@/lib/server/forum";

import { AuthMenu } from "./AuthMenu";

/**
 * Shared shell for every `/discuss` page — same header/breadcrumb/footer
 * role `LearnChrome` plays for `/learn`. Reads who's signed in server-side
 * (no client-side session fetch, no loading flash for the header's own
 * identity chip) via the forum session cookie alone — see
 * `getViewerIdentity`'s own comment for why that's safe without a token
 * refresh here.
 */
export async function DiscussChrome({
  crumbs,
  children,
  viewEvent,
}: {
  crumbs: { label: string; href?: string }[];
  children: React.ReactNode;
  viewEvent: string;
}) {
  const viewer = await getViewerIdentity();
  const profile = viewer ? await getForumProfile(viewer.uid) : null;

  return (
    <main className="dk-grid-bg relative min-h-dvh overflow-hidden bg-zinc-950">
      <AnalyticsBeacon event={viewEvent} />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.07] blur-[140px]"
      />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
            <Zap className="h-4 w-4 text-quantum" />
          </div>
          <Wordmark className="text-[15px] tracking-[0.18em]" />
        </Link>
        <div className="flex items-center gap-2">
          <AuthMenu
            signedIn={Boolean(viewer)}
            displayName={profile?.displayName ?? viewer?.email.split("@")[0] ?? null}
          />
          <CtaLink
            href="/terminal"
            location="discuss-nav"
            className="hidden h-9 items-center gap-1.5 rounded-md border border-quantum/50 bg-quantum/10 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/20 sm:flex"
          >
            Terminal
            <ArrowRight className="h-3.5 w-3.5" />
          </CtaLink>
        </div>
      </header>

      <nav
        aria-label="Breadcrumb"
        className="relative mx-auto flex max-w-5xl flex-wrap items-center gap-1.5 px-5 pb-2 font-mono text-[10.5px] uppercase tracking-wider text-zinc-600"
      >
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-700" />}
            {c.href ? (
              <Link href={c.href} className="transition-colors hover:text-quantum">
                {c.label}
              </Link>
            ) : (
              <span className="text-zinc-400">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      {children}

      <footer className="relative mx-auto max-w-5xl px-5 pb-8 pt-6 text-center text-[10px] leading-relaxed text-zinc-600">
        <p>
          Community discussion, not investment advice — nothing posted here reflects DeltaK&apos;s
          own view, and options trading carries substantial risk of loss.
        </p>
      </footer>
    </main>
  );
}
