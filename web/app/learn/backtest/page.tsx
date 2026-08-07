import { AlertTriangle, TrendingUp, XCircle } from "lucide-react";
import type { Metadata } from "next";

import {
  DivergingBar,
  DrawdownChart,
  EquityCurveChart,
  ExitReasonBar,
  fmtCompactINR,
  LabeledBar,
  SpreadSensitivityChart,
  TradeDiagram,
} from "@/components/BacktestCharts";
import { LearnChrome } from "@/components/LearnChrome";
import {
  COVERAGE_END,
  COVERAGE_START,
  EQUITY_END,
  EQUITY_MARKED_DAYS,
  EQUITY_START,
  EXIT_ATTRIBUTION,
  FOLD_COMPARISON,
  INDEX_ATTRIBUTION,
  INDEX_COUNT,
  KPIS,
  PROTOCOL_ATTRIBUTION,
  SPLIT,
  TOTAL_DAYS,
  TRADE_COUNT,
  WORKED_TRADE,
} from "@/lib/content/backtest";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const PUBLISHED_DATE = "2026-08-07";

export const metadata: Metadata = {
  title: "DKMS Backtesting & Performance Report",
  description:
    "An 18-month walk-forward backtest of the DeltaK Matrix Strategy across five Indian indices — " +
    "Sharpe 6.06, max drawdown −11.2%, 71.8% win rate on 692 trades, with full methodology and a worked trade.",
  keywords: [
    "dkms backtest",
    "deltak matrix strategy performance",
    "options strategy backtest india",
    "sharpe ratio options strategy",
    "walk forward backtest nifty",
  ],
  alternates: { canonical: "/learn/backtest" },
};

const CONFIG_ROWS = [
  ["Entry gate", "Zero-OTM — 2nd/3rd deepest ITM strike only"],
  ["Protocols", "ALPHA (wall pin) · BETA (dip into support) · GAMMA (rally into resistance)"],
  ["Entry order", "Passive limit, 12% below signal mid, 900s timeout"],
  ["Stop", "25% of entry premium"],
  ["Target", "1.5R"],
  ["Thesis exit", "Closes the instant the entry classification stops holding"],
  ["Position sizing", "6% account risk per trade, ₹1,00,000 sizing base, max 3 concurrent"],
  ["Indices", "NIFTY · BANKNIFTY · FINNIFTY · SENSEX · BANKEX"],
] as const;

export default function BacktestReportPage() {
  const pageUrl = `${SITE_URL}/learn/backtest`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "DKMS Backtesting & Performance Report",
    description: metadata.description,
    image: `${pageUrl}/opengraph-image`,
    author: { "@type": "Organization", name: "Quantum Horizon" },
    datePublished: PUBLISHED_DATE,
    dateModified: PUBLISHED_DATE,
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
  };

  const indexMax = Math.max(...INDEX_ATTRIBUTION.map((i) => Math.abs(i.net)));
  const protocolMax = Math.max(...PROTOCOL_ATTRIBUTION.map((p) => p.totalR));
  const foldMax = Math.max(...FOLD_COMPARISON.map((f) => f.expectancy));
  const sortedIndex = [...INDEX_ATTRIBUTION].sort((a, b) => b.net - a.net);
  const discountCapture = WORKED_TRADE.signalMid - WORKED_TRADE.limitQuote;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LearnChrome
        ctaLocation="learn-backtest"
        viewEvent="learn_backtest_view"
        crumbs={[{ label: "Learn", href: "/learn" }, { label: "Backtest Report" }]}
      >
        {/* ---------------------------------------------------------- Hero */}
        <section className="relative mx-auto max-w-4xl px-5 pb-6 pt-4 text-center">
          <p className="dk-label text-[10.5px] text-quantum">Backtesting &amp; Performance Report</p>
          <h1 className="mt-1.5 text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
            The DeltaK Matrix Strategy, tested against 18 months it didn&apos;t get to see coming
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
            A walk-forward study of DKMS across five Indian index option chains — the exact configuration
            currently shipped, and the full results it produces against 18 months of real market data.
          </p>
          <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-1.5 font-mono text-[10.5px] text-zinc-500">
            <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1">
              {COVERAGE_START} → {COVERAGE_END}
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1">{TOTAL_DAYS} trading days</span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1">{INDEX_COUNT} indices</span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1">{TRADE_COUNT.toLocaleString("en-IN")} trades</span>
          </div>
          <div className="mx-auto mt-4 flex max-w-xl items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-left">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
            <p className="text-[11.5px] leading-relaxed text-zinc-400">
              <strong className="text-zinc-200">Backtested, not live.</strong>{" "}
              Every figure below is simulated
              against historical data with modeled charges and a swept bid-ask assumption. The terminal runs in
              Paper mode only — no real capital has traded on this strategy. See{" "}
              <a href="#risks" className="text-quantum hover:underline">
                Risks &amp; Limitations
              </a>
              .
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------- KPIs */}
        <section className="relative mx-auto max-w-5xl px-5 pb-8">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-3 lg:grid-cols-6">
            {KPIS.map((k) => (
              <div key={k.label} className="flex flex-col gap-1.5 bg-zinc-950 p-4">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{k.label}</span>
                <span
                  className={`font-mono text-[20px] font-semibold tabular-nums ${
                    k.tone === "good" ? "text-emerald-400" : k.tone === "bad" ? "text-rose-400" : "text-zinc-100"
                  }`}
                >
                  {k.value}
                </span>
                <span className="text-[10.5px] text-zinc-600">{k.sub}</span>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------- Strategy config */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Strategy configuration</h2>
          <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-zinc-400">
            <p>
              DKMS trades the option chain&apos;s own positioning, not the index&apos;s raw price. It reads the
              strike carrying the heaviest put open interest below spot (<strong className="text-zinc-200">Aegis</strong>,
              a support wall) and the heaviest call open interest above spot (<strong className="text-zinc-200">Zenith</strong>,
              a resistance wall), cross-checks that against each strike&apos;s own relative-rotation trend, and
              only trades when both agree — a pin near a wall, a dip bought into support, or a rally sold into
              resistance.
            </p>
            <p>
              Every candidate is priced through a passive limit order, quoted below the signal&apos;s own mid
              price rather than paid at the offer, and every open position is watched by a thesis-exit rule that
              closes it the instant the read that justified it stops holding — independent of, and faster than,
              the stop-loss underneath it.
            </p>
          </div>
          <div className="dk-panel mt-4 overflow-hidden rounded-lg">
            <table className="w-full text-[12.5px]">
              <tbody>
                {CONFIG_ROWS.map(([label, val], i) => (
                  <tr key={label} className={i > 0 ? "border-t border-zinc-800" : ""}>
                    <td className="w-[38%] py-2.5 pl-4 pr-3 font-mono text-[10.5px] uppercase tracking-wider text-zinc-500">
                      {label}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-200">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* -------------------------------------------------- Worked example */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Worked example — a real trade from the backtest
          </h2>
          <div className="dk-panel mt-3 rounded-lg p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-[11.5px] text-zinc-500">NIFTY · ALPHA · {WORKED_TRADE.side}</p>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {WORKED_TRADE.exitReason} exit
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {[
                ["Date", WORKED_TRADE.date, ""],
                ["Signal mid", `₹${WORKED_TRADE.signalMid.toFixed(2)}`, ""],
                ["Limit quote (−12%)", `₹${WORKED_TRADE.limitQuote.toFixed(2)}`, ""],
                ["Discount captured", `₹${discountCapture.toFixed(2)}/share`, "text-emerald-400"],
                ["Stop (−25% prem.)", `₹${WORKED_TRADE.stop.toFixed(2)}`, "text-rose-400"],
                ["Target (1.5R)", `₹${WORKED_TRADE.target.toFixed(2)}`, "text-emerald-400"],
                ["Held", `${WORKED_TRADE.heldBars} bars (${WORKED_TRADE.heldMinutes} min)`, ""],
                [`Net P&L, 1 lot (${WORKED_TRADE.lotSize})`, `+₹${WORKED_TRADE.netPnl.toLocaleString("en-IN")}`, "text-emerald-400"],
              ].map(([label, val, tone]) => (
                <div key={label}>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
                  <div className={`mt-1 font-mono text-[14px] font-semibold ${tone || "text-zinc-100"}`}>{val}</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <TradeDiagram
                entry={WORKED_TRADE.limitQuote}
                stop={WORKED_TRADE.stop}
                target={WORKED_TRADE.target}
                exitPrice={WORKED_TRADE.exitPrice}
                signalMid={WORKED_TRADE.signalMid}
                entryLabel={`ENTRY ₹${WORKED_TRADE.limitQuote.toFixed(2)}`}
                exitLabel={`EXIT ₹${WORKED_TRADE.exitPrice.toFixed(2)}  +${WORKED_TRADE.exitR.toFixed(3)}R`}
              />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
              The wall test priced this put at a ₹{WORKED_TRADE.signalMid.toFixed(2)} mid. The resting limit order
              filled at ₹{WORKED_TRADE.limitQuote.toFixed(2)} — a ₹{discountCapture.toFixed(2)}/share improvement
              before the trade even opened. Spot kept moving toward Zenith, and the position ran to target,
              closing at ₹{WORKED_TRADE.exitPrice.toFixed(2)} for +{WORKED_TRADE.exitR.toFixed(3)}R.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- Methodology */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Methodology &amp; data</h2>
          <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-3 text-[13px] leading-relaxed text-zinc-400">
              <p>
                <strong className="text-zinc-200">Walk-forward validation.</strong> {TOTAL_DAYS} trading days
                across NIFTY, BANKNIFTY, FINNIFTY, SENSEX and BANKEX ({COVERAGE_START} → {COVERAGE_END}) are split
                chronologically 60/20/20 into train (parameters chosen), validate (parameters confirmed) and test
                (touched exactly once). No parameter in this report was fit on the test fold.
              </p>
              <p>
                <strong className="text-zinc-200">Frictions modeled, not ignored.</strong>{" "}
                Every trade carries
                real statutory charges (STT, exchange fees, stamp duty, GST) on both legs, and a bid-ask spread
                assumption swept from 0% to 3%. Stops and targets are checked against each bar&apos;s high/low, not
                its close.
              </p>
            </div>
            <div className="dk-panel rounded-lg p-4">
              <h3 className="text-[12.5px] font-semibold text-zinc-100">Split composition</h3>
              <div className="mt-3 flex h-8 overflow-hidden rounded-md border border-zinc-800">
                {SPLIT.map((s, i) => (
                  <div
                    key={s.label}
                    style={{ width: `${s.share}%`, background: i === 0 ? "#00f0ff" : i === 1 ? "#0e7a86" : "#3f3f46" }}
                    className={i < SPLIT.length - 1 ? "border-r-2 border-zinc-950" : ""}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5 text-[11px] text-zinc-400">
                {SPLIT.map((s, i) => (
                  <span key={s.label} className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ background: i === 0 ? "#00f0ff" : i === 1 ? "#0e7a86" : "#3f3f46" }}
                    />
                    {s.label} — {s.days} days · n={s.n}
                  </span>
                ))}
              </div>
              <p className="mt-3 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
                Position sizing: 6% account risk per trade, capped at ₹1,00,000 sizing base, max 3 concurrent
                positions. Lot sizes: NIFTY 75 · BANKNIFTY 15 · FINNIFTY 40 · SENSEX 20 · BANKEX 30.
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Performance */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Headline performance</h2>
          <p className="mt-2 text-[12.5px] text-zinc-500">
            Daily mark-to-market equity, ₹1,00,000 starting capital, {EQUITY_MARKED_DAYS} calendar days
            ({EQUITY_START} → {EQUITY_END}). Log scale — the 107× range would flatten most of the curve on a
            linear axis.
          </p>
          <div className="dk-panel mt-4 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-zinc-100">Equity curve</h3>
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">₹1,00,000 → ₹1,07,46,596</span>
            </div>
            <div className="mt-3">
              <EquityCurveChart />
            </div>
          </div>
          <div className="dk-panel mt-4 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-zinc-100">Drawdown from running peak</h3>
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">worst −11.2%, Mar 3 → 4 2025</span>
            </div>
            <div className="mt-3">
              <DrawdownChart />
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <p className="text-[12px] leading-relaxed text-zinc-400">
              The worst drawdown is a single sharp one-day move (Mar 2025), not a multi-week grind. A shallower
              backtest drawdown is still not a promise about the next 18 months; see{" "}
              <strong className="text-zinc-200">Risks &amp; Limitations</strong>.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- Robustness */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Out-of-sample robustness</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="dk-panel rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-zinc-100">Expectancy by walk-forward fold</h3>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">R per trade</span>
              </div>
              <div className="mt-3.5 flex flex-col gap-3.5">
                {FOLD_COMPARISON.map((f, i) => (
                  <div key={f.label}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[11px] tracking-wide text-zinc-400">{f.label} · n={f.n}</span>
                      <span className="font-mono text-[12px] font-semibold text-emerald-400">+{f.expectancy.toFixed(3)}R</span>
                    </div>
                    <div className="h-4 rounded-md bg-zinc-900">
                      <div
                        className="h-full rounded-md bg-quantum"
                        style={{ width: `${(f.expectancy / foldMax) * 100}%`, opacity: 0.55 + i * 0.225 }}
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-600">win {f.winRate}% · PF {f.profitFactor.toFixed(2)}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
                Test — the fold touched exactly once — posts the highest expectancy, win rate and profit factor
                of the three: the out-of-sample fold outperforming, not underperforming, the folds parameters
                were chosen on.
              </p>
            </div>
            <div className="dk-panel rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-zinc-100">Expectancy vs. bid-ask spread</h3>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">test fold, 0→3%</span>
              </div>
              <div className="mt-3">
                <SpreadSensitivityChart />
              </div>
              <p className="mt-3 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
                Modeled spread is 1.0%. Expectancy stays strongly positive even at 3% — triple the modeled
                friction — declining only from +0.635R to +0.566R.
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Attribution */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Performance attribution</h2>

          <div className="dk-panel mt-3 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-zinc-100">Net P&amp;L by index</h3>
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">₹, current sizing</span>
            </div>
            <div className="mt-3.5 flex flex-col gap-2.5">
              {INDEX_ATTRIBUTION.map((i) => (
                <DivergingBar key={i.label} label={i.label} value={i.net} maxAbs={indexMax} />
              ))}
            </div>
            <div className="mt-4 overflow-x-auto border-t border-zinc-800 pt-3">
              <table className="w-full min-w-[420px] text-[12px]">
                <thead>
                  <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                    <th className="pb-2 font-medium">Index</th>
                    <th className="pb-2 pr-0 text-right font-medium">Trades</th>
                    <th className="pb-2 text-right font-medium">Win rate</th>
                    <th className="pb-2 text-right font-medium">Net P&amp;L</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {sortedIndex.map((i) => (
                    <tr key={i.label} className="border-t border-zinc-900">
                      <td className="py-2 font-sans font-semibold text-zinc-200">{i.label}</td>
                      <td className="py-2 text-right text-zinc-400">{i.trades}</td>
                      <td className="py-2 text-right text-zinc-400">{i.winRate}%</td>
                      <td className={`py-2 text-right font-semibold ${i.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {i.net >= 0 ? "+" : "−"}{fmtCompactINR(Math.abs(i.net))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              Every index is net positive. NIFTY carries the largest share of both trades and return; BANKEX
              carries the fewest trades of the five at 86 over 18 months.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="dk-panel rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-zinc-100">R-multiple by protocol</h3>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">total R, all folds</span>
              </div>
              <div className="mt-3.5 flex flex-col gap-2.5">
                {PROTOCOL_ATTRIBUTION.map((p) => (
                  <LabeledBar key={p.label} label={p.label} value={p.totalR} max={protocolMax} color={p.color} valueLabel={`+${p.totalR.toFixed(1)}R`} />
                ))}
              </div>
              <p className="mt-4 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
                BETA (dips bought into support) is the smallest population but the highest-quality: 75.3% win
                rate, 4.38 profit factor. ALPHA carries most of the volume and most of the total return.
              </p>
            </div>
            <div className="dk-panel rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-zinc-100">Exit reason mix</h3>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">share · net ₹</span>
              </div>
              <div className="mt-3.5 flex flex-col gap-3">
                {EXIT_ATTRIBUTION.map((e) => (
                  <ExitReasonBar key={e.label} label={e.label} pct={e.pct} net={e.net} color={e.color} />
                ))}
              </div>
              <p className="mt-4 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
                TARGET and THESIS_BROKEN are almost evenly split (40.8% / 40.5% of trades) and both net positive.
                STOP, at 15.3% of trades, is the only net-negative exit reason.
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Risks */}
        <section id="risks" className="relative mx-auto max-w-4xl px-5 pb-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Risks &amp; limitations</h2>
          <p className="mt-2 text-[12.5px] text-zinc-500">What this report doesn&apos;t paper over.</p>
          <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {[
              {
                title: "Backtest ≠ live",
                body: "Fills are modeled, charges are modeled, and there is no queue priority, latency or partial-fill risk. The terminal has not traded this strategy with real capital — it runs in Paper mode only.",
              },
              {
                title: "Only about 1 in 6 signals fill",
                body: "The passive limit order at 12% below mid only fills when the market genuinely trades down to it — most qualifying signals expire unfilled. Real opportunity is thinner than the raw signal count suggests.",
              },
              {
                title: "BANKNIFTY and FINNIFTY trade thin",
                body: "45 and 58 trades respectively across 18 months — every index clears a trustworthy aggregate sample, but either one alone has a wider confidence interval than the headline numbers suggest.",
              },
              {
                title: "Test fold is the strongest fold",
                body: "Expected — and reassuring that it isn't the weakest — but it's one 74-day window, not an independently sourced dataset. A live paper-trading track record over a fresh period is the stronger evidence still to come.",
              },
            ].map((r) => (
              <div key={r.title} className="dk-panel rounded-lg p-4">
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-rose-400">
                  <XCircle className="h-3.5 w-3.5" />
                  {r.title}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------- Disclaimer */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-[11px] leading-relaxed text-zinc-600">
            <p>
              <strong className="text-zinc-400">Disclaimer.</strong>{" "}
              This report presents backtested and
              simulated historical performance for the DeltaK Matrix Strategy (DKMS) as implemented in the
              Quantum Horizon terminal. Backtested performance has material inherent limitations — it does not
              reflect the impact material market or economic factors might have had on live decision-making, and
              cannot fully account for slippage, liquidity, latency or execution risk in live markets. No
              representation is made that any account will or is likely to achieve profits or losses similar to
              those shown. Options trading carries substantial risk of loss and is not suitable for every
              investor. Nothing in this report constitutes investment advice or a solicitation to invest. All
              figures are as of the backtest run dated {PUBLISHED_DATE} and are subject to revision as
              methodology or data improve.
            </p>
          </div>
        </section>
      </LearnChrome>
    </>
  );
}
