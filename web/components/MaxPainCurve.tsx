/**
 * Illustrative shape of total outstanding option value against assumed
 * closing price — lowest at the max pain strike, rising on either side as
 * more contracts finish in the money. Real curves are lumpier (built from
 * wherever OI actually sits), but the V-shape is what the theory itself
 * claims and is the useful thing to see once.
 */
export function MaxPainCurve() {
  const W = 460;
  const H = 150;
  const PAD = 20;
  const midX = W / 2;

  const points: [number, number][] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2 - 1; // -1..1
    // Valley at the center (max pain = lowest total option value), rising
    // toward both edges — smaller y is higher on screen in SVG space, so
    // the minimum value sits at the largest y (bottom).
    const y = H - PAD - Math.abs(t) * (H - 2 * PAD);
    const x = PAD + (i / n) * (W - 2 * PAD);
    points.push([x, y]);
  }
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaPath = `M${PAD} ${H - PAD} ` + points.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + ` L${W - PAD} ${H - PAD} Z`;
  const valleyY = H - PAD;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="maxpainFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.28} />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity={0.03} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#maxpainFill)" />
      <path d={linePath} fill="none" stroke="#00f0ff" strokeWidth={2} />
      <line x1={midX} y1={PAD} x2={midX} y2={H - PAD} stroke="#71717a" strokeWidth={1} strokeDasharray="3 3" />
      <circle cx={midX} cy={valleyY} r={3.5} fill="#18181b" stroke="#00f0ff" strokeWidth={1.5} />
      <text x={midX} y={valleyY + 16} textAnchor="middle" fontSize="9" fill="#00f0ff">
        MAX PAIN · 25,000
      </text>
      <text x={PAD} y={H - 4} fontSize="9" fill="#71717a">
        24,700
      </text>
      <text x={W - PAD} y={H - 4} textAnchor="end" fontSize="9" fill="#71717a">
        25,300
      </text>
      <text x={PAD} y={PAD + 4} fontSize="9" fill="#71717a">
        total option value ↑
      </text>
    </svg>
  );
}
