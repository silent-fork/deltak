import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { Protocol, Quadrant } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------------------------------------------------------------- formatting */

const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : digits === 0
      ? inr0.format(n)
      : inr2.format(n);

export const money = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : `₹${fmt(n, digits)}`;

export const signed = (n: number | null | undefined, digits = 2) => {
  if (n === null || n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmt(n, digits)}`;
};

export const signedMoney = (n: number | null | undefined, digits = 2) => {
  if (n === null || n === undefined) return "—";
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}₹${fmt(Math.abs(n), digits)}`;
};

/** Compact Indian-market notation for OI and volume. */
export const compact = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs}`;
};

export const countdown = (seconds: number) => {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

export const pnlTone = (n: number) =>
  n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-zinc-400";

/* ------------------------------------------------------------------ strategy */

export const QUADRANT_META: Record<
  Quadrant,
  { label: string; tone: string; dot: string; hex: string; note: string }
> = {
  LEADING: {
    label: "Leading",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
    hex: "#34d399",
    note: "High institutional friction — confirms the Aegis/Zenith bound.",
  },
  IMPROVING: {
    label: "Improving",
    tone: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
    dot: "bg-cyan-400",
    hex: "#22d3ee",
    note: "Early breakout signal — unlocks Protocol Alpha scalps.",
  },
  WEAKENING: {
    label: "Weakening",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
    hex: "#fbbf24",
    note: "Fading momentum — triggers automated TP1 scale-out.",
  },
  LAGGING: {
    label: "Lagging",
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    dot: "bg-rose-400",
    hex: "#fb7185",
    note: "High decay node — long accumulation strictly forbidden.",
  },
};

export const PROTOCOL_META: Record<
  Protocol,
  { name: string; title: string; tone: string; blurb: string }
> = {
  ALPHA: {
    name: "Alpha",
    title: "Equilibrium Range",
    tone: "border-quantum/50 bg-quantum/10 text-quantum",
    blurb: "Buy 2nd ITM Call at Aegis-1; buy 2nd ITM Put at Zenith-1.",
  },
  BETA: {
    name: "Beta",
    title: "Ascension Vector",
    tone: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
    blurb: "Support solid, resistance shifting up. ITM Calls on micro-dips; puts banned.",
  },
  GAMMA: {
    name: "Gamma",
    title: "Cascade Vector",
    tone: "border-rose-500/50 bg-rose-500/10 text-rose-300",
    blurb: "Resistance solid, support shifting down. ITM Puts; calls banned.",
  },
  DELTA: {
    name: "Delta",
    title: "Volatility Trap",
    tone: "border-zinc-600/60 bg-zinc-700/20 text-zinc-400",
    blurb: "Neutral consolidation — auto-driver muted.",
  },
};

export const BLOCK_REASONS: Record<string, string> = {
  NO_DATA: "Awaiting the live feed.",
  VOLATILITY_TRAP: "Protocol Delta — both bounds migrating.",
  MID_RANGE: "Spot is mid-range; Alpha engages only at a bound.",
  AWAIT_DIP: "Beta armed — waiting for a downward micro-dip.",
  NO_VALID_ITM: "No Zero-OTM compliant strike is tradable right now.",
  WEAKENING_NODE: "Node is in Weakening — scaling out, not adding.",
  LAGGING_NODE: "Lagging quadrant — long accumulation forbidden.",
  CAPITAL: "Capped by deployable capital.",
  RISK_BUDGET: "Risk budget too small for one lot.",
  INVALID_STOP: "Stop distance is invalid.",
  ZERO_LOTS: "Sizing resolved to zero lots.",
};
