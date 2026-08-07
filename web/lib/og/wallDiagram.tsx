/**
 * The one diagram every OG image that isn't chart-specific (root, FAQ) can
 * reasonably lead with: Aegis/Zenith wall migration is the actual mechanism
 * DKMS trades, not a stand-in graphic. Pure function returning Satori-safe
 * JSX so it can render inside any ImageResponse route without a client
 * runtime.
 *
 * Satori (next/og's renderer) doesn't support SVG `<text>` nodes — labels
 * have to be ordinary HTML, absolutely positioned over the SVG rather than
 * drawn inside it.
 */
export function WallDiagram({
  width = 460,
  height = 210,
  annotation,
}: {
  width?: number;
  height?: number;
  /** Optional small callout rendered at a fixed point on the spot path — used by the FAQ image to point at the limit-entry discount. */
  annotation?: { xFrac: number; label: string };
}) {
  const W = width, H = height;
  const aegisY = H * 0.78;
  const zenithY = H * 0.22;
  // A hand-tuned zigzag that visibly tests both walls and pulls back —
  // exactly the "migration" the copy beside this diagram describes.
  const spot: [number, number][] = [
    [0, 0.55], [0.08, 0.62], [0.16, 0.52], [0.24, 0.7], [0.32, 0.78],
    [0.4, 0.6], [0.48, 0.4], [0.56, 0.22], [0.64, 0.3], [0.72, 0.18],
    [0.8, 0.32], [0.88, 0.24], [1, 0.3],
  ].map(([fx, fy]) => [fx * W, fy * H] as [number, number]);
  const spotPath = spot.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const annoPt = annotation ? spot[Math.round(annotation.xFrac * (spot.length - 1))] : null;

  return (
    <div style={{ display: "flex", position: "relative", width: W, height: H }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
        <line x1={0} y1={aegisY} x2={W} y2={aegisY} stroke="#10b981" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.7} />
        <line x1={0} y1={zenithY} x2={W} y2={zenithY} stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.7} />
        <path d={spotPath} fill="none" stroke="#00f0ff" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {annoPt ? <circle cx={annoPt[0]} cy={annoPt[1]} r={6} fill="#f59e0b" stroke="#09090b" strokeWidth={2} /> : null}
      </svg>

      <div style={{ display: "flex", position: "absolute", left: 8, top: aegisY - 24, fontSize: 12, color: "#10b981", fontFamily: "ui-monospace, monospace" }}>
        AEGIS · support
      </div>
      <div style={{ display: "flex", position: "absolute", left: 8, top: zenithY - 24, fontSize: 12, color: "#f43f5e", fontFamily: "ui-monospace, monospace" }}>
        ZENITH · resistance
      </div>
      {annoPt && annotation ? (
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: annoPt[0] - 40,
            top: annoPt[1] + 16,
            width: 80,
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            color: "#f59e0b",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {annotation.label}
        </div>
      ) : null}
    </div>
  );
}
