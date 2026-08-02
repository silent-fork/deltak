import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

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

const TITLE = "DeltaK — Quantum Horizon Options Trading Terminal for Angel One";
const DESCRIPTION =
  "DeltaK Matrix Strategy (DKMS): a live options trading terminal for Angel One SmartAPI, " +
  "built around the Quantum Horizon — a live ITM/OTM open-interest profile at spot. " +
  "COA support/resistance wall tracking, RRG relative-strength rotation and signal-driven " +
  "Autopilot execution across NIFTY, BANKNIFTY and FINNIFTY futures & options.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · DeltaK Terminal",
  },
  description: DESCRIPTION,
  keywords: [
    "Angel One",
    "Angel One SmartAPI",
    "options trading",
    "futures and options",
    "F&O trading",
    "algo trading India",
    "NIFTY options",
    "BANKNIFTY options",
    "FINNIFTY options",
    "options trading terminal",
    "options trading signals",
    "intraday options strategy",
    "relative strength rotation",
    "RRG",
    "Quantum Horizon",
    "DeltaK",
    "DKMS",
    "paper trading",
    "options chain analysis",
  ],
  applicationName: "DeltaK Terminal",
  robots: { index: true, follow: true },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "DeltaK Terminal",
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
  name: "DeltaK",
  alternateName: "Quantum Horizon",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-zinc-950 font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
