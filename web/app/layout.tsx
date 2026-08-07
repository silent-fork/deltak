import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/** The DELTAK wordmark's own face (`Wordmark.tsx`) — distinct from the body/mono fonts on purpose, so the brand mark reads as a logotype rather than bold body text. */
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700"],
  display: "swap",
});

/**
 * Where this deployment actually lives, for the tags that have to be
 * absolute (og:image, canonical). Vercel stamps its own production URL into
 * the environment; `NEXT_PUBLIC_DK_SITE_URL` overrides it for a custom
 * domain, and localhost is the honest fallback for a dev server that has
 * neither.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const TITLE = "Quantum Horizon — Options Terminal for the DeltaK Strategy";
/**
 * Google truncates a meta description around 155–160 characters — the old
 * 330-character version wasn't wrong, just invisible past the cut, so every
 * search result rendered a mid-sentence ellipsis instead of a full pitch.
 * Kept under 160 everywhere it's reused below (page <meta>, OG, Twitter,
 * JSON-LD) for the same reason.
 *
 * Quantum Horizon is the product; DeltaK (the DeltaK Matrix Strategy, DKMS)
 * is the strategy it runs — not the other way around. And it's
 * broker-neutral by design regardless: the terminal supports more than one
 * broker (Angel One, Dhan, more to follow) — naming one here would just
 * need editing again at the next addition.
 */
const DESCRIPTION =
  "Quantum Horizon: a live options terminal on the DeltaK Matrix Strategy " +
  "— COA walls, RRG rotation, Autopilot across NIFTY, BANKNIFTY, FINNIFTY, " +
  "SENSEX & BANKEX.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Quantum Horizon",
  },
  description: DESCRIPTION,
  keywords: [
    "Quantum Horizon",
    "qntmhrzn",
    "DeltaK",
    "DeltaK Matrix Strategy",
    "DKMS",
    "options trading",
    "futures and options",
    "F&O trading",
    "algo trading India",
    "multi-broker options trading",
    "Angel One options trading",
    "Dhan options trading",
    "NIFTY options",
    "BANKNIFTY options",
    "FINNIFTY options",
    "SENSEX options",
    "BANKEX options",
    "options trading terminal",
    "options trading signals",
    "intraday options strategy",
    "relative strength rotation",
    "RRG",
    "paper trading",
    "options chain analysis",
  ],
  applicationName: "Quantum Horizon",
  robots: { index: true, follow: true },
  alternates: {
    canonical: "/",
  },
  /** Bing Webmaster Tools site verification — renders as the `msvalidate.01` meta tag Bing asks for in `<head>`. */
  verification: {
    other: {
      "msvalidate.01": "505F7A843426A291442FF98A8B3AEE73",
    },
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Quantum Horizon",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * `SoftwareApplication` structured data — the one shot at a rich result a
 * sign-in-gated SPA has. Free of fabricated ratings/reviews on purpose:
 * Google's guidelines treat invented review markup as spam, and this app has
 * none to report honestly.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Quantum Horizon",
  alternateName: ["DeltaK", "qntmhrzn"],
  description: DESCRIPTION,
  url: SITE_URL,
  applicationCategory: "FinanceApplication",
  applicationSubCategory: "Options Trading Terminal",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
  },
};

/**
 * Standalone `Organization` entity — currently only implied inline as the
 * `author` on the Article schema blocks (strategy pages, backtest report).
 * A top-level block is the standard Knowledge Panel eligibility signal, and
 * is specifically called out in Google's guidance for financial-content
 * sites. No `sameAs`: better to omit it than list a half-maintained social
 * profile.
 */
const organizationData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "QNTMHRZN",
  alternateName: ["Quantum Horizon", "DeltaK"],
  url: SITE_URL,
  logo: `${SITE_URL}/icon`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="min-h-screen bg-zinc-950 font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationData) }}
        />
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
