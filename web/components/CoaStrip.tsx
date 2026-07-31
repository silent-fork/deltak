"use client";

import type { CoaLevels, OptionChain } from "@/lib/types";
import { cn, fmt, signed } from "@/lib/utils";

/**
 * Compact COA (Chart of Accuracy) readout.
 *
 * The two walls and the room between them drive protocol selection, so they get
 * a rail instead of three lines of prose: Aegis below, Zenith above, spot's live
 * position between them, and the distance to each bound — WTB / WTT — which is
 * what decides whether Alpha can engage at all.
 */

/** Distance from spot down to support / up to resistance, in points and %. */
export function coaMetrics(chain: OptionChain) {
  const { levels, spot } = chain;
  const { aegis_1: a1, zenith_1: z1 } = levels;

  const wtb = a1 !== null && spot > 0 ? spot - a1 : null;
  const wtt = z1 !== null && spot > 0 ? z1 - spot : null;
  const band = a1 !== null && z1 !== null ? z1 - a1 : null;
  const pos =
    band !== null && band > 0 && a1 !== null
      ? Math.min(100, Math.max(0, ((spot - a1) / band) * 100))
      : null;

  return { wtb, wtt, band, pos, a1, z1 };
}

function Chip({
  label,
  value,
  sub,
  tone,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  title: string;
}) {
  return (
    <div
      title={title}
      className="min-w-0 rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-1"
    >
      <div className="dk-label truncate text-[9px] leading-none">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-[11px] font-semibold leading-none",
          tone ?? "text-zinc-100",
        )}
      >
        {value}
        {sub ? (
          <span className="ml-1 text-[9px] font-normal opacity-70">{sub}</span>
        ) : null}
      </div>
    </div>
  );
}

/** Aegis-0 / Aegis-1 pair — the static wall and where writers moved it today. */
function WallReadout({
  side,
  cumulative,
  live,
  shift,
}: {
  side: "aegis" | "zenith";
  cumulative: number | null;
  live: number | null;
  shift: number;
}) {
  const support = side === "aegis";
  const migrated = cumulative !== null && live !== null && cumulative !== live;

  return (
    <div
      title={
        support
          ? "Aegis — support. A0 is the cumulative put-OI wall carried into the session; A1 is where intraday put writers have moved it. Shift is its migration in strike steps."
          : "Zenith — resistance. Z0 is the cumulative call-OI wall carried into the session; Z1 is where intraday call writers have moved it. Shift is its migration in strike steps."
      }
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded border px-1.5 py-1",
        support
          ? "border-emerald-500/30 bg-emerald-500/[0.07]"
          : "border-rose-500/30 bg-rose-500/[0.07]",
      )}
    >
      <span
        className={cn(
          "font-mono text-[9px] font-bold uppercase leading-none tracking-wider",
          support ? "text-emerald-400" : "text-rose-400",
        )}
      >
        {support ? "Aegis" : "Zenith"}
      </span>
      <span className="flex min-w-0 items-baseline gap-1 font-mono text-[11px] leading-none">
        <span className="text-zinc-500" title="COA 1.0 — cumulative OI wall">
          {cumulative !== null ? fmt(cumulative, 0) : "—"}
        </span>
        <span className="text-zinc-700">→</span>
        <span
          className={cn(
            "font-semibold",
            support ? "text-emerald-300" : "text-rose-300",
            migrated && "text-glow-quantum",
          )}
          title="COA 2.0 — live intraday wall"
        >
          {live !== null ? fmt(live, 0) : "—"}
        </span>
      </span>
      <span
        className={cn(
          "ml-auto shrink-0 rounded px-1 py-px font-mono text-[9px] font-semibold leading-none",
          shift === 0
            ? "bg-zinc-800/80 text-zinc-500"
            : (support ? shift > 0 : shift < 0)
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-rose-500/15 text-rose-300",
        )}
        title="Net migration over the session, in strike steps."
      >
        {shift === 0 ? "hold" : `${shift > 0 ? "+" : ""}${shift}`}
      </span>
    </div>
  );
}

export function CoaStrip({ chain }: { chain: OptionChain }) {
  const levels: CoaLevels = chain.levels;
  const { wtb, wtt, band, pos } = coaMetrics(chain);

  const pct = (points: number | null, ref: number) =>
    points === null || ref <= 0 ? undefined : `${fmt((points / ref) * 100, 2)}%`;

  return (
    <div className="space-y-1.5 border-b border-zinc-800/70 px-3 py-2">
      {/* The two walls, cumulative → live */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <WallReadout
          side="aegis"
          cumulative={levels.aegis_0}
          live={levels.aegis_1}
          shift={levels.aegis_shift}
        />
        <WallReadout
          side="zenith"
          cumulative={levels.zenith_0}
          live={levels.zenith_1}
          shift={levels.zenith_shift}
        />
      </div>

      {/* Equilibrium rail — where spot sits between the bounds */}
      <div
        className="relative h-1.5 rounded-full bg-gradient-to-r from-emerald-500/25 via-zinc-800 to-rose-500/25"
        title={
          pos === null
            ? "Equilibrium corridor unavailable."
            : `Spot sits ${fmt(pos, 0)}% up the Aegis-1 → Zenith-1 corridor.`
        }
      >
        {pos !== null ? (
          <span
            aria-hidden
            className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-quantum shadow-[0_0_8px_#00f0ff]"
            style={{ left: `${pos}%` }}
          />
        ) : null}
      </div>

      {/* Dense metric row */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        <Chip
          label="WTB"
          title="Wall To Base — points from spot down to Aegis-1 (live support). Alpha buys calls when this closes on zero."
          value={wtb === null ? "—" : fmt(wtb, 0)}
          sub={pct(wtb, chain.spot)}
          tone={
            wtb === null
              ? "text-zinc-500"
              : wtb < 0
                ? "text-rose-300"
                : "text-emerald-300"
          }
        />
        <Chip
          label="WTT"
          title="Wall To Top — points from spot up to Zenith-1 (live resistance). Alpha buys puts when this closes on zero."
          value={wtt === null ? "—" : fmt(wtt, 0)}
          sub={pct(wtt, chain.spot)}
          tone={
            wtt === null
              ? "text-zinc-500"
              : wtt < 0
                ? "text-emerald-300"
                : "text-rose-300"
          }
        />
        <Chip
          label="Band"
          title="Equilibrium corridor width — Zenith-1 minus Aegis-1."
          value={band === null ? "—" : fmt(band, 0)}
          sub={pct(band, chain.spot)}
        />
        <Chip
          label="Pos"
          title="Spot's position inside the corridor: 0% sits on Aegis-1, 100% on Zenith-1."
          value={pos === null ? "—" : `${fmt(pos, 0)}%`}
          tone="text-quantum"
        />
        <Chip
          label="PCR"
          title="Put-Call OI ratio across the rendered window. Above 1 = put-heavy (supportive)."
          value={fmt(chain.pcr)}
          tone={
            chain.pcr >= 1 ? "text-emerald-300" : "text-rose-300"
          }
        />
        <Chip
          label="Spot"
          title={`ATM anchor ${fmt(chain.atm_strike, 0)}`}
          value={fmt(chain.spot, 0)}
          sub={signed(chain.spot_change_pct, 2) + "%"}
          tone={
            chain.spot_change_pct >= 0 ? "text-emerald-300" : "text-rose-300"
          }
        />
      </div>
    </div>
  );
}
