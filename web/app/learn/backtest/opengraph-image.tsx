import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "DKMS Backtesting & Performance Report — an equity curve growing from one lakh to 1.07 crore rupees over 18 months, Sharpe 6.06, max drawdown -11.2%, win rate 71.8%.";

/**
 * A 50-point downsample of the real EQUITY_CURVE from lib/content/backtest.ts
 * (values only — dates aren't needed for a sparkline). Copied rather than
 * imported so this route stays a static, dependency-free render: the shape
 * only changes when the backtest itself is re-run, same cadence as the page.
 */
const EQUITY_SAMPLE: [number, number][] = [
  [100000, 0.0], [101096, 0.0], [168529, 0.0], [182549, -6.43], [233247, 0.0],
  [289161, 0.0], [375113, 0.0], [630796, 0.0], [830976, 0.0], [820816, -2.91],
  [1062158, 0.0], [1177135, -3.68], [1285067, 0.0], [1533578, 0.0], [1955606, 0.0],
  [2149992, 0.0], [2505509, 0.0], [2981052, 0.0], [3414163, 0.0], [3639920, 0.0],
  [4303260, 0.0], [4402300, -0.32], [4785957, 0.0], [5146301, 0.0], [5275617, -0.1],
  [5426838, 0.0], [5793170, 0.0], [5998527, 0.0], [6066604, -1.33], [6529104, 0.0],
  [6877712, 0.0], [7356863, 0.0], [7668992, -0.05], [7926353, -0.14], [8208852, 0.0],
  [8244447, -0.71], [8653783, 0.0], [8897960, 0.0], [8964408, -0.33], [9024260, 0.0],
  [9101512, 0.0], [9252403, 0.0], [9369985, 0.0], [9600172, 0.0], [9808513, 0.0],
  [9920402, -0.17], [10222833, 0.0], [10448715, 0.0], [10737267, 0.0], [10746596, -0.02],
];

function buildPath() {
  const W = 460, H = 210;
  const vals = EQUITY_SAMPLE.map((d) => d[0]);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const logMin = Math.log10(minV * 0.85), logMax = Math.log10(maxV * 1.08);
  const n = EQUITY_SAMPLE.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - ((Math.log10(v) - logMin) / (logMax - logMin)) * H;
  const line = EQUITY_SAMPLE.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[0]).toFixed(1)}`).join(" ");
  const area = `M${x(0)},${H} ${EQUITY_SAMPLE.map((d, i) => `L${x(i).toFixed(1)},${y(d[0]).toFixed(1)}`).join(" ")} L${W},${H} Z`;
  const last = { x: x(n - 1), y: y(EQUITY_SAMPLE[n - 1][0]) };
  return { line, area, last, W, H };
}

const KPIS = [
  { label: "SHARPE", value: "6.06" },
  { label: "MAX DD", value: "−11.2%" },
  { label: "WIN RATE", value: "71.8%" },
  { label: "R:R", value: "1.58:1" },
];

export default function BacktestOpengraphImage() {
  const { line, area, last, W, H } = buildPath();

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#09090b",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          position: "relative",
          padding: "56px 64px",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            width: 640,
            height: 640,
            borderRadius: 9999,
            background: "rgba(0,240,255,0.10)",
            filter: "blur(150px)",
            right: -160,
            top: -140,
          }}
        />

        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              border: "2px solid rgba(0,240,255,0.4)",
              background: "rgba(0,240,255,0.1)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="#00f0ff" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#f4f4f5" }}>
            <span style={{ display: "flex" }}>DELTA</span>
            <span style={{ display: "flex", color: "#00f0ff", marginLeft: -3 }}>K</span>
          </div>
          <div style={{ display: "flex", fontSize: 16, color: "#52525b" }}>·</div>
          <div style={{ display: "flex", fontSize: 16, color: "#71717a" }}>Quantum Horizon</div>
        </div>

        {/* Main row: headline+KPIs left, chart card right */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 40, marginTop: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 500 }}>
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                border: "1px solid #27272a",
                background: "rgba(24,24,27,0.7)",
                borderRadius: 9999,
                padding: "7px 16px",
                fontSize: 14,
                letterSpacing: 2.5,
                textTransform: "uppercase",
                color: "#a1a1aa",
              }}
            >
              Backtesting &amp; Performance Report
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 22,
                fontSize: 50,
                fontWeight: 700,
                color: "#f4f4f5",
                letterSpacing: -1.2,
                lineHeight: 1.08,
              }}
            >
              <span style={{ display: "flex", color: "#00f0ff" }}>DeltaK Matrix</span>
              <span style={{ display: "flex" }}>Strategy</span>
            </div>
            <div style={{ display: "flex", marginTop: 14, fontSize: 19, color: "#71717a", lineHeight: 1.5 }}>
              Run 18 months past its own Quantum Horizon.
            </div>

            <div style={{ display: "flex", gap: 22, marginTop: 34 }}>
              {KPIS.map((k, i) => (
                <div key={k.label} style={{ display: "flex", alignItems: "center", gap: 22 }}>
                  {i > 0 && <div style={{ display: "flex", width: 1, height: 30, background: "#27272a" }} />}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: "#f4f4f5" }}>{k.value}</div>
                    <div style={{ display: "flex", fontSize: 11.5, letterSpacing: 1.2, color: "#71717a" }}>{k.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Equity curve card — the actual chart, not a stand-in graphic */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 500,
              border: "1px solid #27272a",
              background: "rgba(17,17,19,0.85)",
              borderRadius: 16,
              padding: "22px 24px 18px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#71717a" }}>
                  Equity curve
                </div>
                <div style={{ display: "flex", fontSize: 13, color: "#52525b", marginTop: 3 }}>Feb 2025 → Jun 2026, log scale</div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                }}
              >
                <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#34d399" }}>107.5×</div>
                <div style={{ display: "flex", fontSize: 12, color: "#52525b" }}>₹1L → ₹1.07Cr</div>
              </div>
            </div>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 14 }}>
              <line x1={0} y1={H * 0.25} x2={W} y2={H * 0.25} stroke="#27272a" strokeWidth={1} />
              <line x1={0} y1={H * 0.5} x2={W} y2={H * 0.5} stroke="#27272a" strokeWidth={1} />
              <line x1={0} y1={H * 0.75} x2={W} y2={H * 0.75} stroke="#27272a" strokeWidth={1} />
              <path d={area} fill="#00f0ff" opacity={0.14} stroke="none" />
              <path d={line} fill="none" stroke="#00f0ff" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={last.x} cy={last.y} r={7} fill="#00f0ff" />
              <circle cx={last.x} cy={last.y} r={7} fill="none" stroke="#09090b" strokeWidth={3} />
            </svg>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
