/**
 * Theta's defining fact isn't that premium decays — it's that decay
 * accelerates into expiry. A number can't show that shape; a curve can.
 */
export function ThetaCurve() {
  const W = 460;
  const H = 160;
  const PAD = 24;

  const points: [number, number][] = [];
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const t = i / n; // 0 = far from expiry, 1 = expiry
    const remaining = Math.pow(1 - t, 1.8); // convex decay, steepest near expiry
    const x = PAD + t * (W - 2 * PAD);
    const y = PAD + (1 - remaining) * (H - 2 * PAD);
    points.push([x, y]);
  }
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaPath = `M${PAD} ${H - PAD} ` + points.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + ` L${W - PAD} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="thetaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity={0.03} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#thetaFill)" />
      <path d={linePath} fill="none" stroke="#00f0ff" strokeWidth={2} />
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#3f3f46" strokeWidth={1} />
      <text x={PAD} y={H - 6} fontSize="9" fill="#71717a">
        far from expiry
      </text>
      <text x={W - PAD} y={H - 6} textAnchor="end" fontSize="9" fill="#f43f5e">
        expiry
      </text>
      <text x={PAD} y={PAD - 8} fontSize="9" fill="#71717a">
        premium (time value)
      </text>
    </svg>
  );
}
