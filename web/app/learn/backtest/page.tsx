import { AlertTriangle, ShieldAlert, TrendingUp, XCircle } from "lucide-react";
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
  SIZING_EVOLUTION,
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
    "Sharpe 3.30, max drawdown −43.6%, 52.2% win rate on 2,072 trades, with full methodology and a worked trade.",
  keywords: [
    "dkms backtest",
    "deltak matrix strategy performance",
    "options strategy backtest india",
    "sharpe ratio options strategy",
    "walk forward backtest nifty",
  ],
  alternates: { canonical: "/learn/backtest" },
};

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
  const sortedIndex = [...INDEX_ATTRIBUTION].sort((a, b) => b.net - a.net);

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
            A walk-forward study of DKMS across five Indian index option chains — how the wall-and-rotation
            signal performs, what the limit-entry and thesis-tracking execution layer changed, and where the
            strategy is still weak.
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

        {/* -------------------------------------------------- Exec summary */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Executive summary</h2>
          <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-zinc-400">
            <p>
              DKMS trades the option chain&apos;s own positioning, not the index&apos;s raw price. It reads the
              strike carrying the heaviest put open interest below spot (<strong className="text-zinc-200">Aegis</strong>,
              a support wall) and the heaviest call open interest above spot (<strong className="text-zinc-200">Zenith</strong>,
              a resistance wall), cross-checks that against each strike&apos;s own relative-rotation trend, and
              only trades when both agree — a pin near a wall (<strong className="text-zinc-200">ALPHA</strong>), a
              dip bought into support (<strong className="text-zinc-200">BETA</strong>), or a rally sold into
              resistance (<strong className="text-zinc-200">GAMMA</strong>).
            </p>
            <p>
              The honest finding of this study is that <strong className="text-zinc-200">the raw signal alone has
              no edge.</strong>{" "}
              Priced at the live offer with no thesis discipline, the original configuration
              backtests to a −95.7% max drawdown and a −1.35 Sharpe ratio across 127 trades. What fixed it was
              changing how the strategy gets in and out, not what it looks for: a 3% limit-entry discount instead
              of paying the offer, and a thesis-exit rule that closes a position the moment the read that
              justified it breaks — before the stop, not instead of it.
            </p>
            <p>
              With that execution layer live, the same signal backtests to a <strong className="text-zinc-200">3.30
              Sharpe ratio</strong>, a <strong className="text-zinc-200">52.2% win rate</strong> against a{" "}
              <strong className="text-zinc-200">46.1% breakeven requirement</strong>, and turns ₹1,00,000 of paper
              capital into ₹28.37 lakh over {EQUITY_MARKED_DAYS} marked trading days — after a deliberate,
              measured trade-off that cut per-trade risk from 15% to 6% of capital specifically to bring the
              drawdown down from −86% to −44%.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- Execution edge */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            The execution edge — limit entry &amp; thesis tracking
          </h2>
          <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-zinc-400">
            <p>
              <strong className="text-zinc-200">Limit entry, 3.0% discount, 900-second timeout.</strong>{" "}
              The moment a signal qualifies, Autopilot doesn&apos;t pay the live offer — it quotes entry_mid ×
              (1 − 3.0%) and rests that as a limit order for up to 15 minutes. It fills only if the contract
              genuinely trades down to that level. If the window elapses first: no trade, not a worse trade.
            </p>
            <p>
              <strong className="text-zinc-200">Thesis exit.</strong>{" "}
              The original signal had a specific,
              diagnosed flaw: winners resolved in a median of about one 5-minute bar, while losers dragged on for
              a median of roughly thirteen bars before the much-wider stop finally caught them. Thesis-exit
              re-checks the entry condition on every bar a position is open — the stop and target both stay fully
              live underneath it. It now accounts for <strong className="text-zinc-200">75.6% of all exits</strong>,
              at a small but consistently positive mean return.
            </p>
          </div>

          <div className="dk-panel mt-5 rounded-lg p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-zinc-100">Worked example — a real trade from the backtest</h3>
                <p className="mt-1 text-[11.5px] text-zinc-500">NIFTY · ALPHA · call, entered against the Aegis wall</p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full bg-quantum" />
                THESIS_BROKEN exit
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {[
                ["Date", WORKED_TRADE.date, ""],
                ["Signal mid", `₹${WORKED_TRADE.signalMid.toFixed(2)}`, ""],
                ["Limit quote (−3.0%)", `₹${WORKED_TRADE.limitQuote.toFixed(2)}`, ""],
                ["Filled", `${WORKED_TRADE.filledBars} bars later`, ""],
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
              The wall break priced this call at a ₹{WORKED_TRADE.signalMid.toFixed(2)} mid. Rather than pay it,
              Autopilot rested a limit order 3% under and got filled two bars later at ₹{WORKED_TRADE.limitQuote.toFixed(2)} —
              a ₹5.47/share improvement before the trade even opened. The RRG read that justified the entry broke
              after 10 minutes, and thesis-exit closed it at ₹{WORKED_TRADE.exitPrice.toFixed(2)} — short of the
              ₹{WORKED_TRADE.target.toFixed(2)} target, but +{WORKED_TRADE.exitR.toFixed(3)}R and profitable.
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
            ({EQUITY_START} → {EQUITY_END}). Log scale — the 28× range would flatten the first six months on a
            linear axis.
          </p>
          <div className="dk-panel mt-4 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-zinc-100">Equity curve</h3>
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">₹1,00,000 → ₹28,37,362</span>
            </div>
            <div className="mt-3">
              <EquityCurveChart />
            </div>
          </div>
          <div className="dk-panel mt-4 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-zinc-100">Drawdown from running peak</h3>
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">worst −43.6%, Sep 8 → Oct 24 2025</span>
            </div>
            <div className="mt-3">
              <DrawdownChart />
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3.5">
            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
            <p className="text-[12px] leading-relaxed text-zinc-400">
              The −43.6% drawdown (Sep–Oct 2025) is <strong className="text-zinc-200">not a rare tail event</strong> —
              the chart above shows two more drawdowns over −20% before it. A 6%-of-capital risk budget with up to
              3 concurrent positions can lose meaningfully faster than it makes, and did.
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
                        style={{ width: `${(f.expectancy / 0.074) * 100}%`, opacity: 0.55 + i * 0.225 }}
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-600">win {f.winRate}% · PF {f.profitFactor.toFixed(2)}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
                Test — the fold touched exactly once — posts the highest expectancy, win rate and profit factor
                of the three. The test window (most recent 74 days) coincides with the post-fix execution layer
                being fully live across all five indices.
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
                Modeled spread is 1.0%. Expectancy stays positive even at 3% — triple the modeled friction —
                though it roughly halves, from +0.094R to +0.032R.
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
                GAMMA (rallies sold into resistance) is the smallest population but the highest-quality: 55.0% win
                rate, 1.54 profit factor.
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
                THESIS_BROKEN carries 75.6% of trades for +₹17.7L. TARGET is 8.8% of trades but the single
                largest contributor at +₹65.7L — STOP, at 10.9% of trades, is the single largest detractor at
                −₹57.2L.
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Sizing */}
        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Position sizing — how we got to 6%</h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-500">
            Risk-per-trade moved twice, each time for a measured reason — and the second cut is the difference
            between this report&apos;s headline numbers and a strategy that would be hard to defend to a risk
            desk.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {SIZING_EVOLUTION.map((s) => (
              <div
                key={s.tag}
                className={`flex flex-col gap-2.5 rounded-lg border p-4 ${
                  s.final ? "border-quantum/40 bg-quantum/[0.06]" : "dk-panel"
                }`}
              >
                <span className={`font-mono text-[10px] uppercase tracking-wider ${s.final ? "text-quantum" : "text-zinc-500"}`}>
                  {s.tag}
                </span>
                <span className="font-mono text-[21px] font-bold text-zinc-50">{s.risk}</span>
                <p className="text-[11px] leading-relaxed text-zinc-500">{s.note}</p>
                <div className="mt-1 flex flex-col gap-1 text-[11px]">
                  {[
                    ["Trades", s.trades.toLocaleString("en-IN")],
                    ["Win rate", s.winRate],
                    ["Sharpe", s.sharpe],
                    ["Max DD", s.maxDD],
                    ["Net P&L", s.net],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-zinc-400">
                      {label}
                      <span className="font-mono font-semibold text-zinc-200">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-quantum/30 bg-quantum/[0.06] p-3.5">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-quantum" />
            <p className="text-[12px] leading-relaxed text-zinc-400">
              The 15%→6% cut is a <strong className="text-zinc-200">deliberate trade-off</strong>, not a free
              lunch: nominal net P&amp;L drops from ₹66.56L to ₹27.37L. What it buys is a drawdown almost half the
              size (−86.1% → −43.6%) at a higher Sharpe ratio — the position size a real allocator could actually
              sit through.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- Risks */}
        <section id="risks" className="relative mx-auto max-w-4xl px-5 pb-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Risks &amp; limitations</h2>
          <p className="mt-2 text-[12.5px] text-zinc-500">What this report doesn&apos;t paper over.</p>
          <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {[
              {
                title: "A −43.6% drawdown is large",
                body: "Even the de-risked, current-sizing curve loses close to half its peak value at its worst point. Any capital allocated to this strategy should be sized for that reality, not the +2,737% headline.",
              },
              {
                title: "BANKEX is a net loser",
                body: "Highest win rate of the five indices (54.3%) but still net −₹2.66L — the STOP-loss trades there are large enough to outweigh a favorable hit rate.",
              },
              {
                title: "Backtest ≠ live",
                body: "Fills are modeled, charges are modeled, and there is no queue priority, latency or partial-fill risk. The terminal has not traded this strategy with real capital.",
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
