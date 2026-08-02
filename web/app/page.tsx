import {
  ArrowLeftRight,
  ArrowRight,
  Bot,
  Layers,
  LockKeyhole,
  Radar,
  Repeat2,
  ShieldAlert,
  Table2,
  TrendingDown,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { Wordmark } from "@/components/Wordmark";

/**
 * The homepage.
 *
 * Everything past this point in the app lives behind a broker sign-in and
 * renders client-side — a search crawler reading "/terminal" gets nothing
 * but a login form and a boot skeleton, no matter how good Googlebot's JS
 * execution has gotten. This route is the one page in the whole product
 * whose job is to actually say, in plain server-rendered text, what DeltaK
 * is and does — the terminal itself only has to prove it.
 */

const FEATURES = [
  {
    icon: Layers,
    title: "COA Matrix",
    body: "Tracks Aegis (support) and Zenith (resistance) across two generations — the cumulative open-interest wall and the one today's writers are actually building — and tells you the moment one is abandoned for another strike.",
  },
  {
    icon: Radar,
    title: "Quantum Horizon",
    body: "A live ITM/OTM open-interest profile drawn as a literal horizon through the chain: everything left of it is in-the-money for calls, everything right in-the-money for puts, updated tick by tick at spot.",
  },
  {
    icon: Repeat2,
    title: "RRG Momentum",
    body: "Every strike's relative-rotation graph — RS-Ratio against RS-Momentum — sorted into Leading, Improving, Weakening and Lagging quadrants, so a fading node gets scaled out before it becomes a loss.",
  },
  {
    icon: Table2,
    title: "4-Quadrant Option Chain",
    body: "Calls and puts read outward from the strike column, each leg carrying its own RRG quadrant, RS-Ratio, volume, open interest and bid/ask spread — the whole ladder, not a quote you have to click into.",
  },
  {
    icon: Bot,
    title: "Autopilot execution",
    body: "An actionable signal fires itself the instant every gate agrees — protocol, Zero-OTM strike, RRG quadrant — or waits for a manual Execute click. Same sizing, same risk gates, either way.",
  },
  {
    icon: ShieldAlert,
    title: "Risk guards",
    body: "Stop-loss, target and a Daylight Rest window run whether or not a tab is open, with a portfolio-level at-risk ceiling across every open position — not just a per-trade stop.",
  },
] as const;

const PROTOCOLS = [
  {
    icon: ArrowLeftRight,
    name: "Alpha",
    title: "Equilibrium Range",
    tone: "text-quantum",
    body: "Both walls solid. Buys the 2nd ITM Call at Aegis, the 2nd ITM Put at Zenith — a range trade at each bound, nothing in between.",
  },
  {
    icon: TrendingUp,
    name: "Beta",
    title: "Ascension Vector",
    tone: "text-emerald-400",
    body: "Support solid, resistance migrating up. ITM Calls on the next micro-dip; put purchases are banned outright under this regime.",
  },
  {
    icon: TrendingDown,
    name: "Gamma",
    title: "Cascade Vector",
    tone: "text-rose-400",
    body: "Resistance solid, support migrating down. ITM Puts arm on the cascade; calls are banned outright under this regime.",
  },
  {
    icon: Waves,
    name: "Delta",
    title: "Volatility Trap",
    tone: "text-zinc-400",
    body: "Both bounds migrating at once — a consolidation neither side is defending. The auto-driver mutes itself rather than guess.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Sign in with SmartAPI",
    body: "Client code, PIN and a six-digit TOTP — the same loginByPassword flow you'd use on Angel One directly. Nothing is stored beyond the session.",
  },
  {
    n: "02",
    title: "The engine reads the tape",
    body: "COA wall migration, RRG rotation and OI buildup recompute every second the market's open, across NIFTY, BANKNIFTY and FINNIFTY.",
  },
  {
    n: "03",
    title: "A signal arms",
    body: "Protocol, the Zero-OTM strike rule and the RRG quadrant all have to agree before anything is actionable — one dissent and it stays on standby.",
  },
  {
    n: "04",
    title: "Autopilot fires, or you do",
    body: "An armed signal executes itself in Autopilot, or waits for a manual click — same sizing and risk gates either way, in Paper or Live mode.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="dk-grid-bg relative min-h-dvh overflow-hidden bg-zinc-950">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.07] blur-[140px]"
      />

      {/* Nav */}
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
            <Zap className="h-4 w-4 text-quantum" />
          </div>
          <Wordmark className="text-[15px] tracking-[0.18em]" />
        </div>
        <Link
          href="/terminal"
          className="flex h-9 items-center gap-1.5 rounded-md border border-quantum/50 bg-quantum/10 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/20"
        >
          Terminal
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-4xl px-5 pb-16 pt-10 text-center sm:pt-16">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          DeltaK Matrix Strategy · DKMS
        </span>

        <h1 className="mt-6 text-balance text-3xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
          An Angel One options terminal built around the{" "}
          <span className="text-quantum text-glow-quantum">Quantum Horizon</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-balance text-[15px] leading-relaxed text-zinc-400 sm:text-base">
          DeltaK reads COA support/resistance walls, RRG relative-strength rotation
          and live open-interest across NIFTY, BANKNIFTY and FINNIFTY futures &amp;
          options — and either arms a trade for you to take, or takes it itself.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/terminal"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-quantum/60 bg-quantum/15 px-6 text-[13px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25 sm:w-auto"
          >
            Terminal
            <ArrowRight className="h-4 w-4" />
          </Link>
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-600">
            <LockKeyhole className="h-3 w-3" />
            Free — sign in with your own Angel One account
          </span>
        </div>

        <div className="mx-auto mt-9 flex max-w-lg flex-wrap items-center justify-center gap-2">
          {["NIFTY", "BANKNIFTY", "FINNIFTY", "Paper mode", "Live mode", "SmartAPI"].map(
            (chip) => (
              <span
                key={chip}
                className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500"
              >
                {chip}
              </span>
            ),
          )}
        </div>
      </section>

      {/* Features */}
      <section className="relative mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          What the engine reads
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="dk-panel rounded-lg p-4 transition-colors hover:border-zinc-700"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/30 bg-quantum/10">
                <f.icon className="h-4 w-4 text-quantum" />
              </div>
              <h3 className="mt-3 text-[13px] font-semibold text-zinc-100">
                {f.title}
              </h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-500">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Protocols */}
      <section className="relative mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Four protocols, one engine
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-[12.5px] leading-relaxed text-zinc-500">
          Which one is live is decided by how the Aegis and Zenith walls are
          actually migrating this session — not a setting anyone chooses.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROTOCOLS.map((p) => (
            <div key={p.name} className="dk-panel rounded-lg p-4">
              <div className="flex items-center gap-2">
                <p.icon className={`h-4 w-4 ${p.tone}`} />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                  Protocol {p.name}
                </span>
              </div>
              <h3 className={`mt-2 text-[13px] font-semibold ${p.tone}`}>
                {p.title}
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative mx-auto max-w-4xl px-5 py-10">
        <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          How it works
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-3 rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-4">
              <span className="shrink-0 font-mono text-xl font-bold text-quantum/40">
                {s.n}
              </span>
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-zinc-100">
                  {s.title}
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative mx-auto max-w-3xl px-5 py-14 text-center">
        <div className="dk-panel rounded-xl px-6 py-10">
          <h2 className="text-xl font-bold text-zinc-50 sm:text-2xl">
            Sign in and watch the walls move
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-zinc-500">
            Paper mode runs the whole engine — COA, RRG, Autopilot, risk
            guards — against simulated fills, no live order ever placed,
            for as long as you want to watch it work.
          </p>
          <Link
            href="/terminal"
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md border border-quantum/60 bg-quantum/15 px-6 text-[13px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25"
          >
            Terminal
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="relative mx-auto max-w-6xl px-5 pb-8 pt-4 text-center text-[10px] leading-relaxed text-zinc-600">
        <p>
          DeltaK Matrix Strategy (DKMS) · COA 1.0 / 2.0 wall tracking · RRG
          multi-strike momentum · Angel One SmartAPI
        </p>
        <p className="mt-1">
          Not investment advice. Options trading carries substantial risk of
          loss — Paper mode is there to be used.
        </p>
      </footer>
    </main>
  );
}
