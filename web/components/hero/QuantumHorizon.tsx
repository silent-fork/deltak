"use client";

import { useMemo } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { coaMetrics } from "@/lib/coaView";
import type { OptionChain, SpotQuote } from "@/lib/types";
import { useTickFlash } from "@/lib/useEngine";
import { cn, compact, fmt, signed } from "@/lib/utils";

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
}: {
  chain: OptionChain | undefined;
  quote: SpotQuote | undefined;
}) {
  const flash = useTickFlash(quote?.ltp ?? 0);

  const view = useMemo(() => {
    if (!chain || chain.rows.length < 2) return null;

    const rows = chain.rows;
    const n = rows.length;
    const strikes = rows.map((r) => r.strike);
    const maxOi = rows.reduce(
      (m, r) => Math.max(m, r.call?.oi ?? 0, r.put?.oi ?? 0),
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
      maxOi,
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
    };
  }, [chain]);

  const up = (quote?.change ?? 0) >= 0;

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
            <div className="text-[14px] font-semibold">
              {signed(quote?.change ?? 0)}
            </div>
            <div className="mt-1 text-[11px] opacity-85">
              {signed(quote?.change_pct ?? 0)}%
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

              {/* Open-interest profile: calls above the axis, puts below */}
              <div className="relative flex h-[104px] items-stretch gap-[2px]">
                {view.rows.map((row) => {
                  const call =
                    view.maxOi > 0 ? ((row.call?.oi ?? 0) / view.maxOi) * 100 : 0;
                  const put =
                    view.maxOi > 0 ? ((row.put?.oi ?? 0) / view.maxOi) * 100 : 0;
                  return (
                    <div
                      key={row.strike}
                      title={`${fmt(row.strike, 0)} — calls ${compact(row.call?.oi ?? 0)} · puts ${compact(row.put?.oi ?? 0)}`}
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
                <div className="min-w-0" title="Total put and call open interest across the window.">
                  <div className="dk-label text-[9px] leading-none">OI P/C</div>
                  <div className="mt-1 truncate font-mono text-[12px] font-semibold leading-none text-zinc-200">
                    {compact(view.putOi)}
                    <span className="mx-0.5 text-zinc-600">/</span>
                    {compact(view.callOi)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
