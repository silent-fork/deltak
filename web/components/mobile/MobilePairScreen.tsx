import { QrCode, ScanLine, ShieldCheck, Smartphone } from "lucide-react";

import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { Wordmark } from "@/components/Wordmark";
import { MAX_PAIRED_DEVICES } from "@/lib/server/mobile";

/**
 * What a phone sees at `/terminal` before it's paired.
 *
 * A server component, deliberately: there is nothing here that needs
 * client-side state — no scanner, no form, nothing to hydrate. The phone's
 * own camera app does the actual scanning; this screen only ever explains
 * that and waits. The broker sign-in form (client code/ID, PIN, TOTP —
 * Angel One or Dhan) never renders on mobile at all — this replaces it
 * entirely on a mobile user agent.
 *
 * Same `min-h-dvh items-center justify-center` shell as `LoginScreen` —
 * one centered card, sized to actually fit a phone viewport rather than a
 * taller layout that forces its own inner scrollbar. A forced scroll on a
 * screen whose entire job is "glance at this and scan" reads as broken,
 * not busy.
 */
export function MobilePairScreen({
  expired,
  limitReached,
}: {
  expired?: boolean;
  /** This account already has `MAX_PAIRED_DEVICES` phones paired — the QR was valid, but claiming it was refused. */
  limitReached?: boolean;
}) {
  const steps = limitReached
    ? [
        "Open the Quantum Horizon terminal on your desktop",
        "Open the profile menu, top right",
        "Remove a phone under Paired devices, then scan again",
      ]
    : [
        "Sign in to the terminal on your desktop",
        "Open the profile menu, top right",
        "Scan the QR with your camera app",
      ];

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-zinc-950 px-5 py-8">
      <AnalyticsBeacon
        event="mobile_pair_screen_view"
        data={{ expired: Boolean(expired), limit_reached: Boolean(limitReached) }}
      />

      {/* Same single soft light source + grid as LoginScreen, not the page's own busier hero treatment — this is a glance-and-scan utility screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.08] blur-[110px]"
      />
      <div aria-hidden className="dk-grid-bg pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative w-full max-w-[360px] text-center">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
            <QrCode className="h-4 w-4 text-quantum" />
          </div>
          <div className="text-left leading-none">
            <Wordmark className="text-[15px] font-semibold tracking-[0.18em]" />
            <div className="mt-1 text-[9px] uppercase tracking-[0.24em] text-zinc-500">
              Mobile Companion
            </div>
          </div>
        </div>

        <div className="dk-panel relative mt-5 overflow-hidden rounded-2xl p-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-quantum/[0.09] blur-[70px]"
          />

          <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-quantum/40 bg-quantum/10">
            {limitReached ? (
              <Smartphone className="h-5 w-5 text-quantum" />
            ) : (
              <ScanLine className="h-5 w-5 text-quantum" />
            )}
          </div>

          <h1 className="relative mt-3 text-[15px] font-semibold text-zinc-50">
            {limitReached
              ? `${MAX_PAIRED_DEVICES} phones already paired`
              : expired
                ? "That QR expired"
                : "Pair this phone"}
          </h1>
          <p className="relative mx-auto mt-1.5 text-[12px] leading-relaxed text-zinc-400">
            {limitReached
              ? `This account already has ${MAX_PAIRED_DEVICES} phones paired — Quantum Horizon's cap. Remove one from the desktop's profile menu, then scan again.`
              : expired
                ? "QR codes stay valid for two minutes. Open Quantum Horizon on your desktop and scan the fresh one."
                : "Open Quantum Horizon on your desktop, open the profile menu, and scan the QR with this phone's camera."}
          </p>

          <ol className="relative mt-4 space-y-2 text-left">
            {steps.map((step, i) => (
              <li key={step} className="flex items-baseline gap-2.5">
                <span className="shrink-0 font-mono text-[11px] font-semibold text-quantum">{i + 1}.</span>
                <span className="text-[12px] leading-relaxed text-zinc-400">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Same trust-line treatment as LoginScreen's own footer claim — a border-top rule and an icon, not a floating standalone paragraph. */}
        <div className="mt-4 flex items-center justify-center gap-2 border-t border-zinc-900 pt-3.5 text-[10px] text-zinc-600">
          <ShieldCheck className="h-3 w-3 shrink-0" />
          <span>No broker sign-in ever happens on this device.</span>
        </div>

        <p className="relative mt-4 flex items-center justify-center gap-1.5 text-zinc-600">
          <span
            aria-hidden
            className="inline-flex h-2.5 w-4 shrink-0 flex-col overflow-hidden rounded-[2px] ring-1 ring-white/10"
          >
            <span className="h-1/3 w-full bg-[#FF9933]" />
            <span className="h-1/3 w-full bg-white" />
            <span className="h-1/3 w-full bg-[#138808]" />
          </span>
          <span className="text-[10px]">
            Made with <span className="text-rose-400">♥</span> in Bharat
          </span>
        </p>
      </div>
    </main>
  );
}
