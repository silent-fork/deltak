import type { Metadata } from "next";

import { Terminal } from "@/components/Terminal";

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

export default function TerminalRoute() {
  return <Terminal />;
}
