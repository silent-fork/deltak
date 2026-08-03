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
 * that and waits. Angel One's client-code/PIN/TOTP form never renders on
 * mobile at all — this replaces it entirely on a mobile user agent.
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
        "Open the DeltaK terminal on your desktop",
        "Open the profile menu, top right",
        "Remove a phone under Paired devices, then scan again",
      ]
    : [
        "Sign in to the terminal on your desktop",
        "Open the profile menu, top right",
        "Scan the QR with your camera app",
      ];

  return (
    <main className="dk-grid-bg relative h-dvh overflow-hidden bg-zinc-950">
      <AnalyticsBeacon
        event="mobile_pair_screen_view"
        data={{ expired: Boolean(expired), limit_reached: Boolean(limitReached) }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.08] blur-[110px]"
      />

      <div className="dk-scroll relative flex h-dvh flex-col items-center justify-center overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] text-center">
        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
            <QrCode className="h-4 w-4 text-quantum" />
          </div>
          <Wordmark className="text-[16px] tracking-[0.18em]" />
        </div>

        <div className="dk-panel relative mt-8 w-full max-w-xs rounded-2xl p-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-quantum/40 bg-quantum/10">
            {limitReached ? (
              <Smartphone className="h-6 w-6 text-quantum" />
            ) : (
              <ScanLine className="h-6 w-6 text-quantum" />
            )}
          </div>

          <h1 className="mt-4 text-[15px] font-semibold text-zinc-50">
            {limitReached
              ? `${MAX_PAIRED_DEVICES} phones already paired`
              : expired
                ? "That QR expired"
                : "Pair this phone"}
          </h1>
          <p className="mx-auto mt-2 max-w-[22rem] text-[12.5px] leading-relaxed text-zinc-400">
            {limitReached
              ? `This account already has ${MAX_PAIRED_DEVICES} phones paired — DeltaK's cap. Remove one from the desktop's profile menu, then scan again.`
              : expired
                ? "QR codes stay valid for two minutes. Open DeltaK on your desktop and scan the fresh one."
                : "Open the DeltaK terminal on your desktop, open the profile menu, and scan the QR with this phone's camera — not a QR reader inside this page."}
          </p>

          <ol className="mt-5 space-y-2.5 text-left">
            {steps.map((step, i) => (
              <li key={step} className="flex items-start gap-2.5">
                <span className="mt-px flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border border-zinc-700 font-mono text-[10px] font-bold text-zinc-500">
                  {i + 1}
                </span>
                <span className="text-[12px] leading-relaxed text-zinc-400">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="relative mt-6 flex max-w-[16rem] items-start justify-center gap-1.5 text-center text-[10.5px] uppercase tracking-wider text-zinc-600">
          <ShieldCheck className="mt-px h-3 w-3 shrink-0 text-zinc-600" />
          No Angel One sign-in ever happens on this device
        </p>

        <p className="relative mt-8 flex items-center justify-center gap-1.5 text-zinc-600">
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
