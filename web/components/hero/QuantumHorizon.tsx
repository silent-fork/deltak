"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { coaMetrics } from "@/lib/coaView";
import type { Candle, OptionChain, SessionStats, SpotQuote } from "@/lib/types";
import { useTickFlash } from "@/lib/useEngine";
import { cn, compact, fmt, signed } from "@/lib/utils";

/**
 * Live tail of the spot trace.
 *
 * The engine keeps no price history — it only ever publishes the current
 * snapshot — so ticks are accumulated here, in the one place that renders them.
 * The buffer resets whenever the instrument changes or a fresh batch of
 * historical candles lands: the candles already cover everything up to now, and
 * replaying the same minute twice would put a kink in the line.
 */
function useSpotTrace(ltp: number | undefined, resetKey: string, cap = 240) {
  const ref = useRef<{ key: string; points: number[] }>({
    key: resetKey,
    points: [],
  });
  const [, bump] = useState(0);

  useEffect(() => {
    const store = ref.current;
    if (store.key !== resetKey) {
      store.key = resetKey;
      store.points = [];
    }
    if (!ltp || ltp <= 0) return;
    if (store.points[store.points.length - 1] === ltp) return;
    store.points.push(ltp);
    if (store.points.length > cap) store.points.shift();
    bump((n) => n + 1);
  }, [ltp, resetKey, cap]);

  return ref.current.points;
}

const TW = 600;
const TH = 100;

/**
 * The Quantum Horizon, drawn.
 *
 * The horizon is the ITM/OTM split at spot: everything left of it is
 * in-the-money for calls, everything right in-the-money for puts. Rendering it
 * as a literal horizon through the open-interest profile puts the whole board in
 * one glance — where the walls stand, which side carries the weight, and how far
 * price has to travel to reach either bound.
 */

export function QuantumHorizon({
  chain,
  quote,
  candles = [],
  stats = null,
}: {
  chain: OptionChain | undefined;
  quote: SpotQuote | undefined;
  /** Today's one-minute bars from `getCandleData`, oldest first. */
  candles?: Candle[];
  stats?: SessionStats | null;
}) {
  const [metric, setMetric] = useState<"oi" | "volume">("oi");
  const flash = useTickFlash(quote?.ltp ?? 0);
  const underlying = quote?.underlying ?? chain?.underlying ?? "—";
  const live = useSpotTrace(
    quote?.ltp ?? chain?.spot,
    `${underlying}:${candles.length}:${candles[candles.length - 1]?.time ?? ""}`,
  );

  /**
   * The session, then the ticks since it was last read. Without the candles
   * the trace can only start where the page did — which on a terminal opened
   * at noon is a line that says nothing about the day.
   */
  const trace = useMemo(
    () => [...candles.map((c) => c.close), ...live],
    [candles, live],
  );

  /** The trail, scaled to hold both the price range and the walls. */
  const traceView = useMemo(() => {
    if (trace.length < 2) return null;

    const { aegis, zenith } = chain
      ? coaMetrics(chain)
      : { aegis: null, zenith: null };

    const lo = Math.min(...trace);
    const hi = Math.max(...trace);
    // Pull the walls in only when they are close enough not to flatten the
    // trail into a straight line — otherwise the trace tells you nothing.
    const range = Math.max(hi - lo, 1);
    const near = (v: number | null) =>
      v !== null && v >= lo - range * 2.5 && v <= hi + range * 2.5 ? v : null;

    const a = near(aegis);
    const z = near(zenith);
    const min = Math.min(lo, a ?? lo, z ?? lo);
    const max = Math.max(hi, a ?? hi, z ?? hi);
    const pad = Math.max((max - min) * 0.12, 0.5);
    const top = max + pad;
    const bottom = min - pad;
    const span = top - bottom || 1;

    const y = (v: number) => ((top - v) / span) * TH;
    const x = (i: number) => (i / (trace.length - 1)) * TW;

    const line = trace.map((v, i) => `${x(i)},${y(v)}`).join(" ");

    return {
      line,
      area: `M0,${TH} L${line.split(" ").join(" L")} L${TW},${TH} Z`,
      y,
      aegisY: a !== null ? y(a) : null,
      zenithY: z !== null ? y(z) : null,
      last: trace[trace.length - 1],
      lastY: y(trace[trace.length - 1]),
      hi,
      lo,
      rising: trace[trace.length - 1] >= trace[0],
    };
  }, [trace, chain]);

  const view = useMemo(() => {
    if (!chain || chain.rows.length < 2) return null;

    const rows = chain.rows;
    const n = rows.length;
    const strikes = rows.map((r) => r.strike);
    // The profile plots whichever measure is selected; OI shows where positions
    // stand, volume where the session's activity actually went.
    const value = (leg: { oi: number; volume: number } | null) =>
      leg ? (metric === "oi" ? leg.oi : leg.volume) : 0;
    const peak = rows.reduce(
      (m, r) => Math.max(m, value(r.call), value(r.put)),
      0,
    );

    /**
     * Columns are equal width, so a price maps to a *fractional column* rather
     * than a linear position — otherwise the horizon drifts off its own strike
     * whenever the ladder is uneven.
     */
    const posOf = (value: number) => {
      if (value <= strikes[0]) return (0.5 / n) * 100;
      if (value >= strikes[n - 1]) return ((n - 0.5) / n) * 100;
      let i = 0;
      while (i < n - 2 && strikes[i + 1] < value) i++;
      const span = strikes[i + 1] - strikes[i];
      const frac = span > 0 ? (value - strikes[i]) / span : 0;
      return ((i + frac + 0.5) / n) * 100;
    };

    const { aegis, zenith, position } = coaMetrics(chain);
    const aegisView = aegis !== null ? { strike: aegis, pos: posOf(aegis) } : null;
    const zenithView =
      zenith !== null ? { strike: zenith, pos: posOf(zenith) } : null;

    return {
      rows,
      peak,
      value,
      posOf,
      spotPos: posOf(chain.spot),
      atmPos: posOf(chain.atm_strike),
      aegis: aegisView,
      zenith: zenithView,
      // A flag is roughly 8% of the rail wide at the narrowest hero column.
      flagsCollide:
        !!aegisView &&
        !!zenithView &&
        Math.abs(aegisView.pos - zenithView.pos) < 9,
      corridorPos: position,
      lo: strikes[0],
      hi: strikes[n - 1],
      callOi: rows.reduce((a, r) => a + (r.call?.oi ?? 0), 0),
      putOi: rows.reduce((a, r) => a + (r.put?.oi ?? 0), 0),
      callVol: rows.reduce((a, r) => a + (r.call?.volume ?? 0), 0),
      putVol: rows.reduce((a, r) => a + (r.put?.volume ?? 0), 0),
    };
  }, [chain, metric]);

  /**
   * The feed can only quote a change once it has sent a previous close, which
   * it does not always do. The historical session carries one from the first
   * paint, so it stands in — the number shown is against yesterday's close
   * either way.
   */
  const change = quote?.change || stats?.change || 0;
  const changePct = quote?.change_pct || stats?.change_pct || 0;
  const up = change >= 0;

  return (
    <Card className="min-h-0 overflow-hidden">
      <CardContent className="relative flex min-h-0 flex-col gap-2 p-3">
        {/* A single soft light source behind the price keeps the panel from
            reading as a flat slab. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[420px] -translate-x-1/2 rounded-full bg-quantum/[0.06] blur-[80px]"
        />

        {/* Spot. The tick flash rides a slim rail rather than the number's
            background — at 30px a full-width wash reads as an error state. */}
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-stretch gap-2.5">
            <span
              className={cn(
                "w-[3px] shrink-0 rounded-full",
                up ? "bg-emerald-500" : "bg-rose-500",
                flash && "animate-pulse-ring",
              )}
              style={{
                boxShadow: up
                  ? "0 0 10px rgba(16,185,129,0.55)"
                  : "0 0 10px rgba(244,63,94,0.55)",
              }}
            />
            <div className="min-w-0">
              <div className="dk-label truncate text-[9px]">
                {quote?.label ?? chain?.label ?? "—"}
                {chain?.expiry ? (
                  <span className="ml-1.5 text-zinc-600">{chain.expiry}</span>
                ) : null}
              </div>
              <div className="mt-1 font-mono text-[30px] font-semibold leading-none tracking-tight text-zinc-50">
                {fmt(quote?.ltp ?? chain?.spot ?? 0)}
              </div>
            </div>
          </div>

          <div
            className={cn(
              "shrink-0 text-right font-mono leading-none",
              up ? "text-emerald-400" : "text-rose-400",
            )}
          >
            <div className="text-[14px] font-semibold">{signed(change)}</div>
            <div className="mt-1 text-[11px] opacity-85">
              {signed(changePct)}%
            </div>
            <div className="mt-1.5 font-sans text-[9px] uppercase tracking-wider text-zinc-600">
              ATM {chain ? fmt(chain.atm_strike, 0) : "—"}
            </div>
          </div>
        </div>

        {!view ? (
          <div className="flex h-[128px] items-center justify-center rounded-md border border-zinc-800/70 bg-zinc-950/40 text-[11px] text-zinc-600">
            Open-interest profile warming up…
          </div>
        ) : (
          <>
            <div className="relative rounded-md border border-zinc-800/70 bg-zinc-950/50 px-1.5 pb-1 pt-2">
              {/* ITM wash — calls left of the horizon, puts right of it */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-md"
                style={{
                  background: `linear-gradient(90deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.02) ${view.spotPos}%, rgba(244,63,94,0.02) ${view.spotPos}%, rgba(244,63,94,0.05) 100%)`,
                }}
              />

              {/* The corridor the engine expects to trade inside */}
              {view.aegis && view.zenith ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 border-x border-dashed border-quantum/20 bg-quantum/[0.03]"
                  style={{
                    left: `${Math.min(view.aegis.pos, view.zenith.pos)}%`,
                    width: `${Math.abs(view.zenith.pos - view.aegis.pos)}%`,
                  }}
                />
              ) : null}

              {/* Profile: calls above the axis, puts below */}
              <div className="relative flex h-[104px] items-stretch gap-[2px]">
                {view.rows.map((row) => {
                  const call =
                    view.peak > 0 ? (view.value(row.call) / view.peak) * 100 : 0;
                  const put =
                    view.peak > 0 ? (view.value(row.put) / view.peak) * 100 : 0;
                  return (
                    <div
                      key={row.strike}
                      title={`${fmt(row.strike, 0)} — calls ${compact(view.value(row.call))} · puts ${compact(view.value(row.put))} (${metric === "oi" ? "open interest" : "day volume"})`}
                      className="group relative flex min-w-0 flex-1 flex-col"
                    >
                      <div className="flex h-1/2 items-end">
                        <div
                          className="w-full rounded-t-[2px] bg-gradient-to-t from-rose-500/75 to-rose-400/15 transition-[height] duration-500 group-hover:from-rose-400"
                          style={{ height: `${call}%` }}
                        />
                      </div>
                      <div className="flex h-1/2 items-start">
                        <div
                          className="w-full rounded-b-[2px] bg-gradient-to-b from-emerald-500/75 to-emerald-400/15 transition-[height] duration-500 group-hover:from-emerald-400"
                          style={{ height: `${put}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Axis */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-700/70"
                />

                {/* Walls */}
                {view.aegis ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 w-px bg-emerald-400/70"
                    style={{
                      left: `${view.aegis.pos}%`,
                      boxShadow: "0 0 6px rgba(16,185,129,0.6)",
                    }}
                  />
                ) : null}
                {view.zenith ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 w-px bg-rose-400/70"
                    style={{
                      left: `${view.zenith.pos}%`,
                      boxShadow: "0 0 6px rgba(244,63,94,0.6)",
                    }}
                  />
                ) : null}

                {/* The horizon itself */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 bg-quantum"
                  style={{
                    left: `${view.spotPos}%`,
                    boxShadow: "0 0 10px rgba(0,240,255,0.9)",
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-quantum"
                  style={{
                    left: `${view.spotPos}%`,
                    boxShadow: "0 0 8px rgba(0,240,255,0.95)",
                  }}
                />
              </div>

              {/*
                Wall flags. Aegis and Zenith are often adjacent strikes, so when
                they are the flags stack instead of overprinting each other.
              */}
              {view.aegis ? (
                <span
                  title={`Aegis ${fmt(view.aegis.strike, 0)} — support`}
                  style={{ left: `${view.aegis.pos}%` }}
                  className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-b border border-t-0 border-emerald-500/40 bg-zinc-950/95 px-1 font-mono text-[8px] font-bold text-emerald-300"
                >
                  {fmt(view.aegis.strike, 0)}
                </span>
              ) : null}
              {view.zenith ? (
                <span
                  title={`Zenith ${fmt(view.zenith.strike, 0)} — resistance`}
                  style={{
                    left: `${view.zenith.pos}%`,
                    top: view.flagsCollide ? "13px" : 0,
                  }}
                  className="pointer-events-none absolute z-10 -translate-x-1/2 rounded border border-rose-500/40 bg-zinc-950/95 px-1 font-mono text-[8px] font-bold text-rose-300"
                >
                  {fmt(view.zenith.strike, 0)}
                </span>
              ) : null}

              <div className="mt-1 flex items-center justify-between font-mono text-[8px] uppercase tracking-wider text-zinc-600">
                <span>{fmt(view.lo, 0)} · itm calls</span>
                <span
                  className="text-quantum/80"
                  title="The Quantum Horizon — the ITM / OTM split at spot."
                >
                  ◆ horizon
                </span>
                <span>itm puts · {fmt(view.hi, 0)}</span>
              </div>

              {/* Which measure the profile plots, and the day's totals for it */}
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-1">
                <div className="flex items-center gap-1">
                  {(
                    [
                      ["oi", "OI"],
                      ["volume", "Vol"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setMetric(key)}
                      title={
                        key === "oi"
                          ? "Open interest — where positions currently stand."
                          : "Session volume — where the day's activity actually went."
                      }
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors",
                        metric === key
                          ? "border-quantum/60 bg-quantum/15 text-quantum"
                          : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <span
                  title={`Day totals — puts ${compact(metric === "oi" ? view.putOi : view.putVol)} against calls ${compact(metric === "oi" ? view.callOi : view.callVol)}.`}
                  className="truncate font-mono text-[9px] text-zinc-500"
                >
                  <span className="text-emerald-400/80">
                    {compact(metric === "oi" ? view.putOi : view.putVol)}
                  </span>
                  <span className="mx-1 text-zinc-700">puts / calls</span>
                  <span className="text-rose-400/80">
                    {compact(metric === "oi" ? view.callOi : view.callVol)}
                  </span>
                </span>
              </div>
            </div>

            {/* Corridor rail — Aegis, spot, Zenith at a glance */}
            <div className="rounded-md border border-zinc-800/70 bg-zinc-950/50 px-2 py-1.5">
              <div className="flex items-baseline justify-between font-mono text-[9px]">
                <span className="text-emerald-300">
                  {view.aegis ? fmt(view.aegis.strike, 0) : "—"}
                </span>
                <span className="dk-label text-[9px] leading-none">
                  {view.corridorPos === null
                    ? "corridor"
                    : `${fmt(view.corridorPos, 0)}% up corridor`}
                </span>
                <span className="text-rose-300">
                  {view.zenith ? fmt(view.zenith.strike, 0) : "—"}
                </span>
              </div>
              <div className="relative mt-1.5 h-1.5 rounded-full bg-gradient-to-r from-emerald-500/30 via-zinc-800 to-rose-500/30">
                {view.corridorPos !== null ? (
                  <span
                    className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-quantum"
                    style={{
                      left: `${view.corridorPos}%`,
                      boxShadow: "0 0 8px rgba(0,240,255,0.9)",
                    }}
                  />
                ) : null}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      label: "To Aegis",
                      value: chain ? coaMetrics(chain).toSupport : null,
                      tone: "text-emerald-300",
                    },
                    {
                      label: "To Zenith",
                      value: chain ? coaMetrics(chain).toResistance : null,
                      tone: "text-rose-300",
                    },
                  ] as const
                ).map((s) => (
                  <div key={s.label} className="min-w-0">
                    <div className="dk-label text-[9px] leading-none">
                      {s.label}
                    </div>
                    <div
                      className={cn(
                        "mt-1 truncate font-mono text-[12px] font-semibold leading-none",
                        s.tone,
                      )}
                    >
                      {s.value === null ? "—" : fmt(Math.abs(s.value), 0)}
                      <span className="ml-1 text-[9px] font-normal opacity-60">
                        {s.value !== null && chain && chain.spot > 0
                          ? `${fmt((Math.abs(s.value) / chain.spot) * 100, 2)}%`
                          : ""}
                      </span>
                    </div>
                  </div>
                ))}
                {/* The profile footer carries the split; this is the day's size. */}
                <div
                  className="min-w-0"
                  title={`Session volume traded across the window — ${compact(view.putVol)} puts and ${compact(view.callVol)} calls.`}
                >
                  <div className="dk-label text-[9px] leading-none">Day Vol</div>
                  <div className="mt-1 truncate font-mono text-[12px] font-semibold leading-none text-zinc-200">
                    {compact(view.putVol + view.callVol)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/*
          Spot's path against the walls. This block takes whatever height the
          hero row has left over, so the column fills its card at any viewport
          instead of trailing off into dead space.
        */}
        <div className="relative flex min-h-[76px] flex-1 flex-col overflow-hidden rounded-md border border-zinc-800/70 bg-zinc-950/50 px-2 pb-1 pt-1.5">
          <div className="flex shrink-0 items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="dk-label text-[9px] leading-none">Spot Trace</span>
              {/* Say plainly how far back the line goes — a trail that starts
                  at the page load is a different claim from the session. */}
              <span
                title={
                  stats
                    ? `Session ${stats.date} — open ${fmt(stats.open, 2)}, high ${fmt(stats.high, 2)}, low ${fmt(stats.low, 2)}${
                        stats.prev_close
                          ? `, previous close ${fmt(stats.prev_close, 2)}`
                          : ""
                      }. ${stats.candles} one-minute bars from the historical API, extended by live ticks.`
                    : "Accumulated from live ticks since this page opened — no historical session loaded."
                }
                className={cn(
                  "shrink-0 rounded border px-1 font-mono text-[8px] uppercase tracking-wider",
                  stats
                    ? "border-quantum/40 bg-quantum/10 text-quantum/80"
                    : "border-zinc-800 text-zinc-600",
                )}
              >
                {stats ? "session" : "since connect"}
              </span>
            </span>
            {traceView ? (
              <span className="shrink-0 font-mono text-[9px] text-zinc-500">
                <span className="text-emerald-400/80">
                  H {fmt(stats?.high ?? traceView.hi, 0)}
                </span>
                <span className="mx-1 text-zinc-700">·</span>
                <span className="text-rose-400/80">
                  L {fmt(stats?.low ?? traceView.lo, 0)}
                </span>
              </span>
            ) : null}
          </div>

          <div className="relative mt-1 min-h-0 flex-1">
            {!traceView ? (
              <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">
                Tracing spot…
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${TW} ${TH}`}
                preserveAspectRatio="none"
                className="h-full w-full"
                role="img"
                aria-label="Spot price trail against the Aegis and Zenith walls"
              >
                <defs>
                  <linearGradient id="dk-trace" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={traceView.rising ? "#10b981" : "#f43f5e"}
                      stopOpacity="0.28"
                    />
                    <stop
                      offset="100%"
                      stopColor={traceView.rising ? "#10b981" : "#f43f5e"}
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>

                {/* The corridor, as bands the price has to work between */}
                {traceView.zenithY !== null ? (
                  <rect
                    x={0}
                    y={0}
                    width={TW}
                    height={Math.max(0, traceView.zenithY)}
                    fill="#f43f5e"
                    opacity={0.05}
                  />
                ) : null}
                {traceView.aegisY !== null ? (
                  <rect
                    x={0}
                    y={traceView.aegisY}
                    width={TW}
                    height={Math.max(0, TH - traceView.aegisY)}
                    fill="#10b981"
                    opacity={0.05}
                  />
                ) : null}

                <path d={traceView.area} fill="url(#dk-trace)" />
                <polyline
                  points={traceView.line}
                  fill="none"
                  stroke={traceView.rising ? "#34d399" : "#fb7185"}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                {traceView.aegisY !== null ? (
                  <line
                    x1={0}
                    y1={traceView.aegisY}
                    x2={TW}
                    y2={traceView.aegisY}
                    stroke="#10b981"
                    strokeWidth={1}
                    strokeDasharray="5 4"
                    opacity={0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {traceView.zenithY !== null ? (
                  <line
                    x1={0}
                    y1={traceView.zenithY}
                    x2={TW}
                    y2={traceView.zenithY}
                    stroke="#f43f5e"
                    strokeWidth={1}
                    strokeDasharray="5 4"
                    opacity={0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}

                <circle
                  cx={TW}
                  cy={traceView.lastY}
                  r={2.5}
                  fill="#00f0ff"
                  vectorEffect="non-scaling-stroke"
                  style={{ filter: "drop-shadow(0 0 5px rgba(0,240,255,0.95))" }}
                />
              </svg>
            )}

            {/* Wall tags ride outside the SVG so they stay undistorted */}
            {traceView?.aegisY !== null && traceView ? (
              <span
                style={{ top: `${(traceView.aegisY! / TH) * 100}%` }}
                className="pointer-events-none absolute left-0 -translate-y-1/2 rounded-sm bg-zinc-950/85 px-1 font-mono text-[8px] font-bold uppercase text-emerald-300"
              >
                Aegis
              </span>
            ) : null}
            {traceView?.zenithY !== null && traceView ? (
              <span
                style={{ top: `${(traceView.zenithY! / TH) * 100}%` }}
                className="pointer-events-none absolute left-0 -translate-y-1/2 rounded-sm bg-zinc-950/85 px-1 font-mono text-[8px] font-bold uppercase text-rose-300"
              >
                Zenith
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
