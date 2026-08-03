import { cookies, headers } from "next/headers";
import type { Metadata } from "next";

import { MobileCompanion } from "@/components/mobile/MobileCompanion";
import { MobilePairScreen } from "@/components/mobile/MobilePairScreen";
import { Terminal } from "@/components/Terminal";
import { isMobileUserAgent } from "@/lib/server/device";
import { MOBILE_SESSION_COOKIE, mobileSessionClientCode } from "@/lib/server/mobile";

/**
 * The terminal itself is a client component (it's one long-lived engine hook,
 * not a page that renders once), so this file exists only to give the route
 * its own metadata — a plain page.tsx can't export metadata once it's marked
 * "use client".
 *
 * Not indexed: everything a crawler can actually see here without a broker
 * session is the sign-in gate, which has no unique content of its own and
 * would only dilute relevance against the real homepage at "/". The app
 * itself is still fully crawlable (nothing here blocks that) — it just isn't
 * the page Google should be ranking.
 *
 * On a phone, this same route branches entirely away from Angel One's own
 * sign-in: a mobile user agent never sees the client-code/PIN/TOTP form, by
 * construction — it gets either the "scan this on your desktop" screen or,
 * once paired, the read-only companion. See `lib/server/mobile.ts`.
 */
export const metadata: Metadata = {
  title: "Terminal",
  description:
    "Sign in with your Angel One SmartAPI credentials to open the live DeltaK terminal.",
  alternates: {
    canonical: "/terminal",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

export default async function TerminalRoute({
  searchParams,
}: {
  searchParams: Promise<{ mobile?: string }>;
}) {
  const ua = (await headers()).get("user-agent");
  if (!isMobileUserAgent(ua)) return <Terminal />;

  const mobileSessionId = (await cookies()).get(MOBILE_SESSION_COOKIE)?.value;
  const clientCode = await mobileSessionClientCode(mobileSessionId);
  const { mobile } = await searchParams;
  if (clientCode) return <MobileCompanion clientCode={clientCode} justPaired={mobile === "paired"} />;

  return <MobilePairScreen expired={mobile === "expired"} />;
}
