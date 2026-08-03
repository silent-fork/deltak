import { computePayoff, strikeFor, type Leg, type PayoffExample } from "@/lib/content/payoff";

/**
 * A pure, server-rendered SVG payoff diagram — no client JS, no user input,
 * every number baked in at render time from a fixed illustrative example.
 * The profit/loss fill uses a single hard-stop gradient split exactly at the
 * zero-P&L line, which is what lets one polygon (the area between the curve
 * and the zero baseline) render as Aegis green above zero and Zenith rose
 * below it without drawing loss and profit as separate shapes.
 */

const W = 640;
const H = 280;
const PAD_L = 54;
const PAD_R = 18;
const PAD_T = 22;
const PAD_B = 30;

export function PayoffChart({
  legs,
  example,
  compact = false,
  id,
}: {
  legs: Leg[];
  example: PayoffExample;
  compact?: boolean;
  id: string;
}) {
  const summary = computePayoff(legs, example);
  const atm = Math.round(example.spot / example.strikeStep) * example.strikeStep;
  const [domainMin, domainMax] = summary.domain;

  const pnls = summary.curve.map((p) => p.pnl);
  const rawMax = Math.max(...pnls, 0);
  const rawMin = Math.min(...pnls, 0);
  const span = Math.max(rawMax - rawMin, 1);
  const yMax = rawMax + span * 0.16;
  const yMin = rawMin - span * 0.16;

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const x = (s: number) => PAD_L + ((s - domainMin) / (domainMax - domainMin)) * plotW;
  const y = (pnl: number) => PAD_T + ((yMax - pnl) / (yMax - yMin)) * plotH;

  const zeroY = y(0);
  const gradId = `pnlfill-${id}`;
  const zeroOffset = Math.min(1, Math.max(0, zeroY / H));

  const points = summary.curve.map((p) => [x(p.s), y(p.pnl)] as const);
  const linePath = points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const areaPath =
    `M${points[0][0].toFixed(1)} ${zeroY.toFixed(1)} ` +
    points.map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join(" ") +
    ` L${points[points.length - 1][0].toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const fmt = (n: number) =>
    Math.abs(n) >= 1000 ? `${n < 0 ? "-" : ""}${(Math.abs(n) / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${Math.round(n)}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Payoff diagram at expiry: max profit ${
        summary.unlimitedProfit ? "unlimited" : `₹${fmt(summary.maxProfit)}`
      }, max loss ₹${fmt(Math.abs(summary.maxLoss))}, breakeven at ${summary.breakevens.join(" and ")}.`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
          <stop offset={zeroOffset} stopColor="#10b981" stopOpacity={compact ? 0.28 : 0.32} />
          <stop offset={zeroOffset} stopColor="#f43f5e" stopOpacity={compact ? 0.22 : 0.26} />
        </linearGradient>
      </defs>

      {/* zero P&L baseline */}
      <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke="#3f3f46" strokeWidth={1} />

      {/* Quantum Horizon — the ATM reference line */}
      <line
        x1={x(atm)}
        y1={PAD_T}
        x2={x(atm)}
        y2={H - PAD_B}
        stroke="#00f0ff"
        strokeOpacity={0.55}
        strokeWidth={1}
        strokeDasharray="3 3"
      />

      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke="#e4e4e7" strokeWidth={compact ? 1.5 : 2} />

      {!compact &&
        summary.breakevens.map((be) => (
          <g key={be}>
            <line
              x1={x(be)}
              y1={PAD_T}
              x2={x(be)}
              y2={H - PAD_B}
              stroke="#71717a"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <circle cx={x(be)} cy={zeroY} r={3.5} fill="#18181b" stroke="#e4e4e7" strokeWidth={1.5} />
          </g>
        ))}

      {!compact && (
        <>
          <text x={x(atm)} y={PAD_T - 8} textAnchor="middle" fontSize="9" fill="#00f0ff" letterSpacing="0.04em">
            QUANTUM HORIZON · {atm}
          </text>
          {summary.breakevens.map((be) => (
            <text key={be} x={x(be)} y={H - PAD_B + 14} textAnchor="middle" fontSize="9" fill="#a1a1aa">
              BE {be}
            </text>
          ))}
          <text x={PAD_L} y={y(summary.maxProfit) - 6} fontSize="9" fill="#10b981">
            {summary.unlimitedProfit ? "profit unlimited ↑" : `max profit ₹${fmt(summary.maxProfit)}`}
          </text>
          <text x={PAD_L} y={y(summary.maxLoss) + 12} fontSize="9" fill="#f43f5e">
            {summary.unlimitedLoss ? "loss unlimited ↓" : `max loss ₹${fmt(Math.abs(summary.maxLoss))}`}
          </text>
        </>
      )}
    </svg>
  );
}

export function legStrikeLabel(leg: Leg, example: PayoffExample): string {
  const strike = strikeFor(example, leg.offset);
  const qty = leg.qty ?? 1;
  return `${leg.action === "buy" ? "Buy" : "Sell"} ${qty > 1 ? `${qty}x ` : ""}${strike} ${leg.type === "call" ? "CE" : "PE"}`;
}
