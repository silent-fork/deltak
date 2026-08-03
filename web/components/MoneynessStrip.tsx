/**
 * ITM/ATM/OTM is the one concept that reads differently for calls than for
 * puts, which is exactly what makes it confusing in prose — two mirrored
 * strips, split at the Quantum Horizon, make the mirroring visible instead
 * of asking the reader to hold both rules in their head at once.
 */
type Emphasis = "itm" | "atm" | "otm" | "moneyness";

const ZONE_COLOR = "#10b981";
const DIM = "#3f3f46";

function Row({ label, itmSide }: { label: string; itmSide: "left" | "right"; emphasis: Emphasis }) {
  const W = 300;
  const H = 26;
  const mid = W / 2;
  const itmRect = itmSide === "left" ? { x: 0, w: mid } : { x: mid, w: mid };
  const otmRect = itmSide === "left" ? { x: mid, w: mid } : { x: 0, w: mid };

  return (
    <div>
      <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <rect x={itmRect.x} y={0} width={itmRect.w} height={H} fill={ZONE_COLOR} fillOpacity={0.28} />
        <rect x={otmRect.x} y={0} width={otmRect.w} height={H} fill={DIM} fillOpacity={0.5} />
        <line x1={mid} y1={-4} x2={mid} y2={H + 4} stroke="#00f0ff" strokeWidth={1.5} strokeDasharray="3 2" />
        <text
          x={itmRect.x + itmRect.w / 2}
          y={H / 2 + 4}
          textAnchor="middle"
          fontSize="10"
          fontWeight={600}
          fill="#6ee7b7"
        >
          ITM
        </text>
        <text
          x={otmRect.x + otmRect.w / 2}
          y={H / 2 + 4}
          textAnchor="middle"
          fontSize="10"
          fontWeight={600}
          fill="#a1a1aa"
        >
          OTM
        </text>
      </svg>
    </div>
  );
}

export function MoneynessStrip({ emphasis }: { emphasis: Emphasis }) {
  return (
    <div className="dk-panel space-y-3 rounded-lg p-4">
      <Row label="Call strikes" itmSide="left" emphasis={emphasis} />
      <Row label="Put strikes" itmSide="right" emphasis={emphasis} />
      <p className="text-center font-mono text-[9px] uppercase tracking-wider text-quantum">
        ↑ Quantum Horizon — the ATM strike, spot's current position
      </p>
    </div>
  );
}
