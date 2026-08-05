import {
  ArrowLeftRight,
  ArrowRight,
  Bot,
  BookOpen,
  Building2,
  Crosshair,
  KeyRound,
  Layers,
  LineChart,
  LockKeyhole,
  Radar,
  Repeat2,
  Rocket,
  ScanLine,
  ShieldAlert,
  Sigma,
  Table2,
  TrendingDown,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";

import { CtaLink } from "@/components/CtaLink";
import { Wordmark } from "@/components/Wordmark";

/**
 * The homepage.
 *
 * Everything past this point in the app lives behind a broker sign-in and
 * renders client-side — a search crawler reading "/terminal" gets nothing
 * but a login form and a boot skeleton, no matter how good Googlebot's JS
 * execution has gotten. This route is the one page in the whole product
 * whose job is to actually say, in plain server-rendered text, what
 * Quantum Horizon is and does — the terminal itself only has to prove it.
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
    border: "border-quantum/25",
    body: "Both walls solid. Buys the 2nd ITM Call at Aegis, the 2nd ITM Put at Zenith — a range trade at each bound, nothing in between.",
    rule: "Engages only inside the invalidation band around a wall — mid-range, it waits.",
  },
  {
    icon: TrendingUp,
    name: "Beta",
    title: "Ascension Vector",
    tone: "text-emerald-400",
    border: "border-emerald-500/25",
    body: "Support solid, resistance migrating up. ITM Calls on the next micro-dip; put purchases are banned outright under this regime.",
    rule: "Arms only on a downward micro-dip in spot — Puts are structurally banned, not just discouraged.",
  },
  {
    icon: TrendingDown,
    name: "Gamma",
    title: "Cascade Vector",
    tone: "text-rose-400",
    border: "border-rose-500/25",
    body: "Resistance solid, support migrating down. ITM Puts arm on the cascade; calls are banned outright under this regime.",
    rule: "Arms on the cascade itself — Calls are structurally banned, not just discouraged.",
  },
  {
    icon: Waves,
    name: "Delta",
    title: "Volatility Trap",
    tone: "text-zinc-400",
    border: "border-zinc-700",
    body: "Both bounds migrating at once — a consolidation neither side is defending. The auto-driver mutes itself rather than guess.",
    rule: "No candidate clears the Zero-OTM/RRG gate here — nothing to execute, by design.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    icon: KeyRound,
    title: "Connect your broker",
    body: "Angel One or Dhan, more to follow — client code/ID, PIN and a six-digit TOTP either way. Nothing is stored beyond the session.",
  },
  {
    n: "02",
    icon: ScanLine,
    title: "The engine reads the tape",
    body: "COA wall migration, RRG rotation and OI buildup recompute every second the market's open, across NIFTY, BANKNIFTY, FINNIFTY, SENSEX and BANKEX.",
  },
  {
    n: "03",
    icon: Crosshair,
    title: "A signal arms",
    body: "Protocol, the Zero-OTM strike rule and the RRG quadrant all have to agree before anything is actionable — one dissent and it stays on standby.",
  },
  {
    n: "04",
    icon: Rocket,
    title: "Autopilot fires, or you do",
    body: "An armed signal executes itself in Autopilot, or waits for a manual click — same sizing and risk gates either way, against simulated fills in Paper mode.",
  },
] as const;

const LEARN_SECTIONS = [
  {
    href: "/learn/strategies",
    icon: Sigma,
    title: "Strategies",
    body: "Twelve setups from a plain long call through iron condors and the jade lizard, each with a payoff diagram.",
  },
  {
    href: "/learn/glossary",
    icon: BookOpen,
    title: "Glossary",
    body: "Strikes, the Greeks, margin and settlement rules — plus Aegis, Zenith, Quantum Horizon and DKMS, defined in full.",
  },
  {
    href: "/learn/trading-styles",
    icon: LineChart,
    title: "Trading Styles",
    body: "Intraday, swing and positional options trading compared, and the buying-vs-selling decision underneath all three.",
  },
  {
    href: "/learn/indices",
    icon: Building2,
    title: "Indices",
    body: "NIFTY, BANKNIFTY, FINNIFTY, SENSEX, BANKEX and every other major Indian index F&O contract — lot size, strike step, exchange.",
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
        <div className="flex items-center gap-4">
          <CtaLink
            href="/learn"
            location="nav-learn"
            className="hidden h-9 items-center rounded-md border border-zinc-700 bg-zinc-900/60 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 sm:flex"
          >
            Learn
          </CtaLink>
          <CtaLink
            href="/terminal"
            location="nav"
            className="flex h-9 items-center gap-1.5 rounded-md border border-quantum/50 bg-quantum/10 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/20"
          >
            Terminal
            <ArrowRight className="h-3.5 w-3.5" />
          </CtaLink>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-4xl px-5 pb-16 pt-10 text-center sm:pt-16">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          DeltaK Matrix Strategy · DKMS
        </span>

        <h1 className="mt-6 text-balance text-3xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
          <span className="text-quantum [text-shadow:0_0_6px_rgba(0,240,255,0.3)]">
            Quantum Horizon
          </span>{" "}
          — the options terminal running the DeltaK strategy
        </h1>

        {/*
          Was text-[15px]/text-base and a full mechanism-and-index rundown —
          the same visual weight as the h1 itself, reading as two headlines
          stacked rather than a headline and its subhead, and the five index
          names it spelled out are the same five the chip row two beats below
          already names individually. Cut to the two moves DKMS actually
          watches for, "five Indian indices" standing in for the roll call.
        */}
        <p className="mx-auto mt-5 max-w-2xl text-balance text-[13px] leading-relaxed text-zinc-400 sm:text-[14px]">
          Walls shift. Rotation turns. Quantum Horizon watches both across
          five Indian indices — then arms your trade, or fires it itself.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3">
          {/* Capped, not full-bleed: on mobile this wrapper is the shared width
              for the two buttons, so the CTA row reads as one deliberate size
              rather than content-hugging pills. Side-by-side at every width —
              `flex-1` on each button splits the capped wrapper evenly on a
              phone; past `sm` the wrapper itself stops capping and each
              button reverts to its own natural (unequal) width. */}
          <div className="flex w-full max-w-[19rem] flex-row items-stretch gap-2 sm:w-auto sm:max-w-none sm:items-center sm:gap-3">
            <CtaLink
              href="/terminal"
              location="hero"
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-quantum/60 bg-quantum/15 px-3 text-[12px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25 sm:h-11 sm:flex-none sm:px-7 sm:text-[13px]"
            >
              Terminal
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </CtaLink>
            <CtaLink
              href="/learn"
              location="hero-learn"
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 text-[12px] font-semibold uppercase tracking-wider text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 sm:h-11 sm:flex-none sm:px-7 sm:text-[13px]"
            >
              Learn
            </CtaLink>
          </div>
          <span className="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-600">
            <LockKeyhole className="h-3 w-3" />
            Free — connect your own broker account
          </span>

          {/*
            Not a third button in the Terminal/Learn pair — that would imply
            it's a third way into the same gated app, when it's the one
            surface on this whole site nobody has to sign in for at all,
            reads without an account, and isn't the product talking at you. A
            standalone banner earns that distinction, reskinned around
            people rather than a dashboard: three overlapping initials
            stand in for real threads across three of Discuss's own
            categories (matching their own accent colors — see
            lib/content/forumCategoryStyle.tsx) instead of one icon naming
            a feature, and the ping sits on the frontmost avatar rather
            than centered, so it reads as "someone's here" and not just
            "this pill is decorative."
          */}
          <CtaLink
            href="/discuss"
            location="hero-discuss"
            className="group mt-2 inline-flex items-center gap-3 rounded-full border border-quantum/30 bg-quantum/[0.06] py-1.5 pl-1.5 pr-4 transition-colors hover:border-quantum/50 hover:bg-quantum/10"
            pendingClassName="mt-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-quantum/30 bg-quantum/[0.06]"
          >
            <span className="flex shrink-0 items-center -space-x-2">
              <span className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-zinc-950 bg-zenith/20 text-[9px] font-bold text-zenith">
                G
              </span>
              <span className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-zinc-950 bg-aegis/20 text-[9px] font-bold text-aegis">
                M
              </span>
              <span className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-zinc-950 bg-quantum/20 text-[9px] font-bold text-quantum">
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-quantum/70" />
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-quantum" />
                S
              </span>
            </span>
            {/*
              Two copy lengths, not one wrapped one — a phone-width pill
              wrapping this onto two lines broke the pill shape (confirmed
              at 390px). `whitespace-nowrap` plus a shorter mobile string
              keeps it one line everywhere instead.
            */}
            <span className="whitespace-nowrap text-left text-[11px] leading-none text-zinc-300 sm:hidden">
              <span className="font-semibold uppercase tracking-wider text-quantum">QntmHrzn</span>{" "}
              — real traders, real threads
            </span>
            <span className="hidden whitespace-nowrap text-left text-[11.5px] leading-tight text-zinc-300 sm:inline">
              <span className="font-semibold uppercase tracking-wider text-quantum">Quantum Horizon</span>{" "}
              — strategy, market talk &amp; more, from real traders, not us
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-quantum transition-transform group-hover:translate-x-0.5" />
          </CtaLink>
        </div>

        <div className="mx-auto mt-9 flex max-w-lg flex-wrap items-center justify-center gap-2">
          {["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "BANKEX", "Paper mode"].map(
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

      {/* Strategy — the centerpiece. Everything else on the page is context
          around this: DKMS is what DeltaK actually is. */}
      <section className="relative mx-auto max-w-6xl px-5 pb-10">
        <div className="dk-panel relative overflow-hidden rounded-2xl p-6 sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 h-64 w-64 rounded-full bg-quantum/[0.08] blur-[110px]"
          />

          <div className="relative text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-quantum/40 bg-quantum/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-quantum">
              DeltaK Matrix Strategy
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
              Four protocols. One regime, live.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
              Which protocol is armed is read directly off how the Aegis
              (support) and Zenith (resistance) walls are actually migrating
              this session — never a setting anyone chooses. Every candidate
              still has to clear the Zero-OTM rule (longs restricted to the
              2nd/3rd deepest ITM strike) and the RRG gate (a Lagging quadrant
              is high-decay and forbidden outright) before it's actionable.
            </p>
          </div>

          <div className="relative mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROTOCOLS.map((p) => (
              <div
                key={p.name}
                className={`rounded-lg border bg-zinc-950/50 p-4 ${p.border}`}
              >
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
                <p className="mt-2.5 border-t border-zinc-800/70 pt-2 font-mono text-[10.5px] leading-relaxed text-zinc-600">
                  {p.rule}
                </p>
              </div>
            ))}
          </div>
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

      {/* How it works */}
      <section className="relative mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          How it works
        </h2>

        <div className="relative mt-12 grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
              <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-quantum/40 bg-zinc-950">
                <s.icon className="h-5 w-5 text-quantum" />
                <span className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 font-mono text-[9px] font-bold text-zinc-500">
                  {s.n}
                </span>
              </div>
              {i < STEPS.length - 1 ? (
                <ArrowRight
                  aria-hidden
                  className="absolute -right-[1.35rem] top-6 hidden h-4 w-4 -translate-y-1/2 text-quantum/40 lg:block"
                />
              ) : null}
              <h3 className="mt-4 text-[13.5px] font-semibold text-zinc-100">
                {s.title}
              </h3>
              <p className="mt-1.5 max-w-[15rem] text-[12.5px] leading-relaxed text-zinc-500 lg:max-w-none">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Learn — the free static wiki, a separate surface from the terminal
          above: no login, no data input, nothing computed per-visitor. */}
      <section className="relative mx-auto max-w-6xl px-5 py-10">
        <div className="dk-panel relative overflow-hidden rounded-2xl p-6 sm:p-10">
          <div className="relative text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              <BookOpen className="h-3 w-3" />
              Free · No login · Reference
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
              The Quantum Horizon Wiki
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
              Strategy payoff diagrams, an options and Indian F&amp;O glossary,
              trading styles and index reference — the same Aegis, Zenith and
              Quantum Horizon vocabulary the terminal itself trades on,
              explained in full.
            </p>
          </div>

          <div className="relative mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LEARN_SECTIONS.map((s) => (
              <CtaLink
                key={s.href}
                href={s.href}
                location={`learn-teaser-${s.href.split("/").pop()}`}
                className="group flex flex-col rounded-lg border border-zinc-800/70 bg-zinc-950/50 p-4 transition-colors hover:border-zinc-700"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/30 bg-quantum/10">
                  <s.icon className="h-4 w-4 text-quantum" />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold text-zinc-100">{s.title}</h3>
                <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-zinc-500">{s.body}</p>
                <span className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-zinc-500 transition-colors group-hover:text-quantum">
                  Browse
                  <ArrowRight className="h-3 w-3" />
                </span>
              </CtaLink>
            ))}
          </div>
        </div>
      </section>

      {/*
        Final CTA — was a full-width, centered, ~230px box, the same
        oversized-relative-to-its-content shape the /learn section's closing
        panel had before that redesign. Same fix here: compact and
        asymmetric, a bordered glyph earning its keep as the one non-text
        element, copy left-aligned, both buttons on the same row on desktop.
      */}
      <section className="relative mx-auto max-w-4xl px-5 pb-14">
        <div className="dk-panel relative flex flex-col items-center gap-4 overflow-hidden rounded-xl px-5 py-5 text-center sm:flex-row sm:justify-between sm:text-left">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-quantum/[0.09] blur-[70px]"
          />
          <div className="relative flex flex-col items-center gap-3.5 sm:flex-row">
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-quantum/30 bg-quantum/10 sm:flex">
              <Zap className="h-5 w-5 text-quantum" />
            </span>
            <div>
              <h2 className="text-[14px] font-bold text-zinc-50">
                Sign in and watch the walls move
              </h2>
              <p className="mt-1 max-w-md text-[12px] leading-relaxed text-zinc-500">
                Paper mode runs the whole engine — COA, RRG, Autopilot, risk guards — against
                simulated fills, no live order ever placed.
              </p>
            </div>
          </div>
          <div className="relative flex shrink-0 items-stretch gap-2">
            <CtaLink
              href="/terminal"
              location="closing"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-quantum/60 bg-quantum/15 px-4 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25"
            >
              Terminal
              <ArrowRight className="h-3.5 w-3.5" />
            </CtaLink>
            <CtaLink
              href="/tools"
              location="closing-tools"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 px-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
            >
              Toolkit
            </CtaLink>
          </div>
        </div>
      </section>

      <footer className="relative mx-auto max-w-6xl px-5 pb-8 pt-4 text-center text-[10px] leading-relaxed text-zinc-600">
        <p className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 font-mono text-[10px] uppercase tracking-wider">
          <CtaLink href="/terminal" location="footer-terminal" className="transition-colors hover:text-quantum">
            Terminal
          </CtaLink>
          <CtaLink href="/tools" location="footer-tools" className="transition-colors hover:text-quantum">
            Tools
          </CtaLink>
          <CtaLink href="/learn" location="footer-learn" className="transition-colors hover:text-quantum">
            Learn
          </CtaLink>
          <CtaLink href="/discuss" location="footer-discuss" className="transition-colors hover:text-quantum">
            Discuss
          </CtaLink>
        </p>
        <p>
          DeltaK Matrix Strategy (DKMS) · COA 1.0 / 2.0 wall tracking · RRG
          multi-strike momentum · Multi-broker market data
        </p>
        <p className="mt-1">
          Not investment advice. Options trading carries substantial risk of
          loss. Paper mode only, for now — every fill here is simulated.
        </p>
        {/* A literal tricolour swatch rather than relying on an emoji flag
            rendering consistently across platforms — three real stripes,
            same restraint as the rest of the palette. */}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-zinc-600">
          <span
            aria-hidden
            className="inline-flex h-2.5 w-4 shrink-0 flex-col overflow-hidden rounded-[2px] ring-1 ring-white/10"
          >
            <span className="h-1/3 w-full bg-[#FF9933]" />
            <span className="h-1/3 w-full bg-white" />
            <span className="h-1/3 w-full bg-[#138808]" />
          </span>
          Made with <span className="text-rose-400">♥</span> in Bharat
        </p>
      </footer>
    </main>
  );
}
