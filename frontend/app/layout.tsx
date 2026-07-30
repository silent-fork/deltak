import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";

import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Delta-K Terminal",
  description:
    "Options trading HUD and signal engine — Delta-K Matrix Strategy (DKMS) over NIFTY, BANKNIFTY and FINNIFTY.",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="min-h-screen bg-zinc-950 font-mono">{children}</body>
    </html>
  );
}
