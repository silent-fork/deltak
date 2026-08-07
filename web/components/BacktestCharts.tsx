import { EQUITY_CURVE, MODELED_SPREAD, SPREAD_SENSITIVITY } from "@/lib/content/backtest";

/**
 * Every chart on /learn/backtest is plain server-rendered SVG — the data
 * never changes per-request, so there's no reason to ship client JS to draw
 * it. Paths are computed once at request time from the same arrays the page
 * text quotes numbers from, so the picture and the prose can't drift apart.
 */

const fmtINR = (n: number) => {
  const neg = n < 0;
  const abs = Math.abs(n);
  return (neg ? "−" : "") + "₹" + abs.toLocaleString("en-IN");
};
const fmtCompactINR = (n: number) => {
  const neg = n < 0;
  const abs = Math.abs(n);
  const s = abs >= 100000 ? `₹${(abs / 100000).toFixed(2)}L` : abs >= 1000 ? `₹${(abs / 1000).toFixed(1)}K` : `₹${abs.toFixed(0)}`;
  return (neg ? "−" : "") + s;
};

export function EquityCurveChart() {
  const W = 900, H = 260, ML = 58, MR = 10, MT = 14, MB = 26;
  const plotW = W - ML - MR, plotH = H - MT - MB;
  const vals = EQUITY_CURVE.map((d) => d[1]);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const logMin = Math.log10(minV * 0.92), logMax = Math.log10(maxV * 1.06);
  const n = EQUITY_CURVE.length;
  const x = (i: number) => ML + (i / (n - 1)) * plotW;
  const y = (v: number) => MT + (1 - (Math.log10(v) - logMin) / (logMax - logMin)) * plotH;

  const ticks = [100000, 300000, 1000000, 3000000].filter((t) => t >= minV * 0.8 && t <= maxV * 1.2);
  const lineD = EQUITY_CURVE.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[1])}`).join(" ");
  const areaD = `M${x(0)},${y(minV * 0.92)} ${EQUITY_CURVE.map((d, i) => `L${x(i)},${y(d[1])}`).join(" ")} L${x(n - 1)},${y(minV * 0.92)} Z`;
  const everyN = Math.ceil(n / 7);
  const lastPoint = EQUITY_CURVE[n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Equity curve, log scale, February 2025 to June 2026, growing from one lakh rupees to 28.37 lakh rupees">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} stroke="#27272a" strokeWidth={1} />
          <text x={4} y={y(t) + 4} fontSize={10.5} fill="#71717a" fontFamily="ui-monospace, monospace">{fmtCompactINR(t)}</text>
        </g>
      ))}
      <path d={areaD} fill="#00f0ff" opacity={0.1} stroke="none" />
      <path d={lineD} fill="none" stroke="#00f0ff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(lastPoint[1])} r={4} fill="#00f0ff" stroke="#09090b" strokeWidth={2} />
      {Array.from({ length: n }, (_, i) => i).filter((i) => i % everyN === 0).map((i) => (
        <text key={i} x={x(i)} y={H - 6} fontSize={10} fill="#71717a" textAnchor="middle" fontFamily="ui-monospace, monospace">
          {EQUITY_CURVE[i][0].slice(0, 7)}
        </text>
      ))}
    </svg>
  );
}

export function DrawdownChart() {
  const W = 900, H = 130, ML = 58, MR = 10, MT = 10, MB = 22;
  const plotW = W - ML - MR, plotH = H - MT - MB;
  const n = EQUITY_CURVE.length;
  const minDD = Math.min(...EQUITY_CURVE.map((d) => d[2]));
  const x = (i: number) => ML + (i / (n - 1)) * plotW;
  const y = (v: number) => MT + (v / minDD) * plotH;
  const lineD = EQUITY_CURVE.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[2])}`).join(" ");
  const areaD = `M${x(0)},${y(0)} ${EQUITY_CURVE.map((d, i) => `L${x(i)},${y(d[2])}`).join(" ")} L${x(n - 1)},${y(0)} Z`;
  const everyN = Math.ceil(n / 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Drawdown from running peak, worst point negative 43.6 percent in September–October 2025">
      {[0, minDD].map((t) => (
        <g key={t}>
          <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} stroke="#27272a" strokeWidth={1} />
          <text x={4} y={y(t) + 4} fontSize={10.5} fill="#71717a" fontFamily="ui-monospace, monospace">{t.toFixed(1)}%</text>
        </g>
      ))}
      <path d={areaD} fill="#f43f5e" opacity={0.14} stroke="none" />
      <path d={lineD} fill="none" stroke="#f43f5e" strokeWidth={1.6} strokeLinejoin="round" />
      {Array.from({ length: n }, (_, i) => i).filter((i) => i % everyN === 0).map((i) => (
        <text key={i} x={x(i)} y={H - 4} fontSize={10} fill="#71717a" textAnchor="middle" fontFamily="ui-monospace, monospace">
          {EQUITY_CURVE[i][0].slice(0, 7)}
        </text>
      ))}
    </svg>
  );
}

export function SpreadSensitivityChart() {
  const W = 480, H = 210, ML = 42, MR = 14, MT = 14, MB = 26;
  const plotW = W - ML - MR, plotH = H - MT - MB;
  const maxY = 0.1;
  const x = (v: number) => ML + (v / 3.0) * plotW;
  const y = (v: number) => MT + (1 - v / maxY) * plotH;
  const lineD = SPREAD_SENSITIVITY.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.spread)},${y(d.expectancy)}`).join(" ");
  const areaD = `M${x(0)},${y(0)} ${SPREAD_SENSITIVITY.map((d) => `L${x(d.spread)},${y(d.expectancy)}`).join(" ")} L${x(3)},${y(0)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Expectancy versus bid-ask spread, test fold, staying positive from 0 to 3 percent spread">
      {[0, 0.025, 0.05, 0.075, 0.1].map((t) => (
        <g key={t}>
          <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} stroke="#27272a" strokeWidth={1} />
          <text x={2} y={y(t) + 3.5} fontSize={9.5} fill="#71717a" fontFamily="ui-monospace, monospace">+{t.toFixed(2)}R</text>
        </g>
      ))}
      {[0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0].map((t) => (
        <text key={t} x={x(t)} y={H - 8} fontSize={9.5} fill="#71717a" textAnchor="middle" fontFamily="ui-monospace, monospace">{t.toFixed(1)}%</text>
      ))}
      <line x1={x(MODELED_SPREAD)} x2={x(MODELED_SPREAD)} y1={MT} y2={H - MB} stroke="#71717a" strokeWidth={1} strokeDasharray="3,3" />
      <text x={x(MODELED_SPREAD) + 5} y={MT + 11} fontSize={9.5} fill="#71717a" fontFamily="ui-monospace, monospace">modeled</text>
      <path d={areaD} fill="#00f0ff" opacity={0.1} stroke="none" />
      <path d={lineD} fill="none" stroke="#00f0ff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {SPREAD_SENSITIVITY.map((d) => (
        <circle key={d.spread} cx={x(d.spread)} cy={y(d.expectancy)} r={4} fill="#00f0ff" stroke="#09090b" strokeWidth={2} />
      ))}
    </svg>
  );
}

export function DivergingBar({ label, value, maxAbs }: { label: string; value: number; maxAbs: number }) {
  const w = (Math.abs(value) / maxAbs) * 48;
  const good = value >= 0;
  return (
    <div className="grid grid-cols-[84px_1fr_84px] items-center gap-2.5">
      <div className="text-[12px] font-semibold text-zinc-300">{label}</div>
      <div className="relative h-5 rounded-md bg-zinc-900">
        <div className="absolute bottom-0 top-0 left-1/2 w-px bg-zinc-700" />
        <div
          className={`absolute bottom-[2px] top-[2px] rounded ${good ? "bg-emerald-500" : "bg-rose-500"}`}
          style={good ? { left: "calc(50% + 1px)", width: `calc(${w}% - 1px)` } : { right: "calc(50% + 1px)", width: `calc(${w}% - 1px)` }}
        />
      </div>
      <div className={`text-right font-mono text-[11.5px] tabular-nums ${good ? "text-emerald-400" : "text-rose-400"}`}>
        {value >= 0 ? "+" : ""}{fmtCompactINR(value)}
      </div>
    </div>
  );
}

export function LabeledBar({ label, value, max, color, valueLabel }: { label: string; value: number; max: number; color: string; valueLabel: string }) {
  const w = (value / max) * 100;
  return (
    <div className="grid grid-cols-[84px_1fr_74px] items-center gap-2.5">
      <div className="text-[12px] font-semibold text-zinc-300">{label}</div>
      <div className="relative h-5 rounded-md bg-zinc-900">
        <div className="absolute inset-y-[2px] left-[2px] rounded" style={{ width: `calc(${w}% - 4px)`, background: color }} />
      </div>
      <div className="text-right font-mono text-[11.5px] tabular-nums text-zinc-100">{valueLabel}</div>
    </div>
  );
}

export function ExitReasonBar({ label, pct, net, color }: { label: string; pct: number; net: number; color: string }) {
  const good = net >= 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-zinc-300">
          <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
          {label}
        </span>
        <span className={`font-mono text-[11px] ${good ? "text-emerald-400" : "text-rose-400"}`}>
          {pct}% · {good ? "+" : ""}{fmtCompactINR(net)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-900">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function TradeDiagram({
  entry, stop, target, exitPrice, signalMid, entryLabel, exitLabel,
}: {
  entry: number; stop: number; target: number; exitPrice: number; signalMid: number; entryLabel: string; exitLabel: string;
}) {
  const W = 920, H = 118;
  const lo = Math.min(stop, entry, exitPrice) - 12;
  const hi = Math.max(target, entry, exitPrice) + 14;
  const y = (v: number) => H - 22 - ((v - lo) / (hi - lo)) * (H - 44);
  const x0 = 30, x1 = 640, ex = x0 + 55, tx = x0 + 230;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Trade diagram: entry ${entry}, stop ${stop}, target ${target}, exit ${exitPrice}`}>
      <line x1={x0} x2={x1} y1={y(stop)} y2={y(stop)} stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4,3" />
      <line x1={x0} x2={x1} y1={y(target)} y2={y(target)} stroke="#10b981" strokeWidth={1.5} strokeDasharray="4,3" />
      <line x1={x0} x2={x1} y1={y(signalMid)} y2={y(signalMid)} stroke="#71717a" strokeWidth={1} strokeDasharray="2,3" />
      <text x={x1 + 8} y={y(target) + 3.5} fontSize={11} fill="#10b981" fontFamily="ui-monospace, monospace">Target 1.5R ₹{target.toFixed(2)}</text>
      <text x={x1 + 8} y={y(signalMid) + 3.5} fontSize={11} fill="#71717a" fontFamily="ui-monospace, monospace">Signal mid ₹{signalMid.toFixed(2)}</text>
      <text x={x1 + 8} y={y(stop) + 3.5} fontSize={11} fill="#f43f5e" fontFamily="ui-monospace, monospace">Stop −25% ₹{stop.toFixed(2)}</text>
      <line x1={ex} x2={tx} y1={y(entry)} y2={y(exitPrice)} stroke="#00f0ff" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={ex} cy={y(entry)} r={5} fill="#00f0ff" stroke="#09090b" strokeWidth={2} />
      <circle cx={tx} cy={y(exitPrice)} r={5} fill="#10b981" stroke="#09090b" strokeWidth={2} />
      <text x={ex} y={y(entry) - 12} fontSize={11} fontWeight={700} fill="#00f0ff" textAnchor="middle" fontFamily="ui-monospace, monospace">{entryLabel}</text>
      <text x={tx} y={y(exitPrice) - 12} fontSize={11} fontWeight={700} fill="#10b981" textAnchor="middle" fontFamily="ui-monospace, monospace">{exitLabel}</text>
    </svg>
  );
}

export { fmtINR, fmtCompactINR };
