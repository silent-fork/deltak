import { QrCode, ScanLine, ShieldCheck } from "lucide-react";

import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { Wordmark } from "@/components/Wordmark";

/**
 * What a phone sees at `/terminal` before it's paired.
 *
 * A server component, deliberately: there is nothing here that needs
 * client-side state — no scanner, no form, nothing to hydrate. The phone's
 * own camera app does the actual scanning; this screen only ever explains
 * that and waits. Angel One's client-code/PIN/TOTP form never renders on
 * mobile at all — this replaces it entirely on a mobile user agent.
 */
export function MobilePairScreen({ expired }: { expired?: boolean }) {
  return (
    <main className="dk-scroll dk-grid-bg relative flex min-h-dvh flex-col items-center justify-center overflow-y-auto overflow-x-hidden bg-zinc-950 px-6 py-10 text-center">
      <AnalyticsBeacon event="mobile_pair_screen_view" data={{ expired: Boolean(expired) }} />

      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.08] blur-[110px]"
      />

      <div className="relative flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
          <QrCode className="h-4 w-4 text-quantum" />
        </div>
        <Wordmark className="text-[16px] tracking-[0.18em]" />
      </div>

      <div className="dk-panel relative mt-8 w-full max-w-xs rounded-2xl p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-quantum/40 bg-quantum/10">
          <ScanLine className="h-6 w-6 text-quantum" />
        </div>

        <h1 className="mt-4 text-[15px] font-semibold text-zinc-50">
          {expired ? "That QR expired" : "Pair this phone"}
        </h1>
        <p className="mx-auto mt-2 max-w-[22rem] text-[12.5px] leading-relaxed text-zinc-400">
          {expired
            ? "QR codes stay valid for two minutes. Open DeltaK on your desktop and scan the fresh one."
            : "Open the DeltaK terminal on your desktop, open the profile menu, and scan the QR with this phone's camera — not a QR reader inside this page."}
        </p>

        <ol className="mt-5 space-y-2.5 text-left">
          {[
            "Sign in to the terminal on your desktop",
            "Open the profile menu, top right",
            "Scan the QR with your camera app",
          ].map((step, i) => (
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
    </main>
  );
}
