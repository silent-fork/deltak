import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "DKMS Backtesting & Performance Report — win rate by index: FINNIFTY 77.6%, NIFTY 75.9%, BANKNIFTY 73.3%, SENSEX 67.9%, BANKEX 64.0%. Sharpe 6.06, max drawdown -11.2%, overall win rate 71.8%.";

/**
 * Per-index win rate from INDEX_ATTRIBUTION in lib/content/backtest.ts.
 * Copied rather than imported so this route stays a static, dependency-free
 * render: the numbers only change when the backtest itself is re-run, same
 * cadence as the page. Sorted by win rate, best first — a leaderboard read.
 */
const INDEX_WIN_RATES = [
  { label: "FINNIFTY", winRate: 77.6 },
  { label: "NIFTY", winRate: 75.9 },
  { label: "BANKNIFTY", winRate: 73.3 },
  { label: "SENSEX", winRate: 67.9 },
  { label: "BANKEX", winRate: 64.0 },
];

const KPIS = [
  { label: "SHARPE", value: "6.06" },
  { label: "MAX DD", value: "−11.2%" },
  { label: "WIN RATE", value: "71.8%" },
  { label: "R:R", value: "1.58:1" },
];

export default function BacktestOpengraphImage() {
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

          {/* Win rate by index card — the actual per-index breakdown, not a stand-in graphic */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 500,
              border: "1px solid #27272a",
              background: "rgba(17,17,19,0.85)",
              borderRadius: 16,
              padding: "22px 24px 20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#71717a" }}>
                  Win rate by index
                </div>
                <div style={{ display: "flex", fontSize: 13, color: "#52525b", marginTop: 3 }}>Share of trades closed a win</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#34d399" }}>71.8%</div>
                <div style={{ display: "flex", fontSize: 12, color: "#52525b" }}>overall, 692 trades</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 17, marginTop: 24 }}>
              {INDEX_WIN_RATES.map((idx) => (
                <div key={idx.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ display: "flex", width: 116, fontSize: 15, fontWeight: 600, color: "#d4d4d8" }}>
                    {idx.label}
                  </div>
                  <div style={{ display: "flex", flex: 1, height: 18, borderRadius: 6, background: "#18181b" }}>
                    <div
                      style={{
                        display: "flex",
                        width: `${idx.winRate}%`,
                        height: "100%",
                        background: "#00f0ff",
                        borderRadius: 6,
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", width: 62, justifyContent: "flex-end", fontSize: 15, fontWeight: 700, color: "#f4f4f5" }}>
                    {idx.winRate.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
