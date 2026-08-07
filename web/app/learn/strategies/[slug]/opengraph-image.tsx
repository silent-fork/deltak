import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { computePayoff, type Leg } from "@/lib/content/payoff";
import { getStrategy, STRATEGIES, STRATEGY_EXAMPLE } from "@/lib/content/strategies";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return STRATEGIES.map((s) => ({ slug: s.slug }));
}

/** Same curve the real page's PayoffChart draws — just a plainer SVG rendering for Satori. */
function buildPayoffPath(legs: Leg[]) {
  const W = 460, H = 220;
  const summary = computePayoff(legs, STRATEGY_EXAMPLE);
  const [domainMin, domainMax] = summary.domain;
  const pnls = summary.curve.map((p) => p.pnl);
  const rawMax = Math.max(...pnls, 0);
  const rawMin = Math.min(...pnls, 0);
  const span = Math.max(rawMax - rawMin, 1);
  const yMax = rawMax + span * 0.18;
  const yMin = rawMin - span * 0.18;

  const x = (s: number) => ((s - domainMin) / (domainMax - domainMin)) * W;
  const y = (pnl: number) => ((yMax - pnl) / (yMax - yMin)) * H;
  const zeroY = y(0);

  const pts = summary.curve.map((p) => [x(p.s), y(p.pnl)] as const);
  const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const abovePts = summary.curve.map((p) => [x(p.s), y(Math.max(p.pnl, 0))] as const);
  const belowPts = summary.curve.map((p) => [x(p.s), y(Math.min(p.pnl, 0))] as const);
  const above = `M${abovePts[0][0].toFixed(1)},${zeroY.toFixed(1)} ${abovePts.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(" ")} L${abovePts[abovePts.length - 1][0].toFixed(1)},${zeroY.toFixed(1)} Z`;
  const below = `M${belowPts[0][0].toFixed(1)},${zeroY.toFixed(1)} ${belowPts.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(" ")} L${belowPts[belowPts.length - 1][0].toFixed(1)},${zeroY.toFixed(1)} Z`;

  return { line, above, below, zeroY, W, H, maxProfit: summary.maxProfit, maxLoss: summary.maxLoss, unlimitedProfit: summary.unlimitedProfit };
}

export default async function StrategyOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const strategy = getStrategy(slug);
  if (!strategy) notFound();

  const { line, above, below, zeroY, W, H, maxProfit, maxLoss, unlimitedProfit } = buildPayoffPath(strategy.legs);

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
          <div style={{ display: "flex", fontSize: 16, color: "#71717a" }}>Quantum Horizon Wiki</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 40, marginTop: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 500 }}>
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                alignItems: "center",
                gap: 10,
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
              <span style={{ display: "flex" }}>{strategy.category}</span>
              <span style={{ display: "flex", color: "#3f3f46" }}>·</span>
              <span style={{ display: "flex" }}>{strategy.complexity}</span>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 22,
                fontSize: 52,
                fontWeight: 700,
                color: "#f4f4f5",
                letterSpacing: -1.2,
                lineHeight: 1.08,
              }}
            >
              {strategy.name}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 14,
                fontSize: 22,
                fontWeight: 600,
                color: "#00f0ff",
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              {strategy.outlook}
            </div>

            <div style={{ display: "flex", gap: 30, marginTop: 34 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: "#34d399" }}>
                  {unlimitedProfit ? "Unlimited" : `₹${Math.round(maxProfit).toLocaleString("en-IN")}`}
                </div>
                <div style={{ display: "flex", fontSize: 11.5, letterSpacing: 1.2, color: "#71717a" }}>MAX PROFIT</div>
              </div>
              <div style={{ display: "flex", width: 1, height: 30, background: "#27272a" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: "#fb7185" }}>
                  ₹{Math.round(Math.abs(maxLoss)).toLocaleString("en-IN")}
                </div>
                <div style={{ display: "flex", fontSize: 11.5, letterSpacing: 1.2, color: "#71717a" }}>MAX LOSS</div>
              </div>
            </div>
          </div>

          {/* The real payoff curve — same computePayoff() the strategy page charts. */}
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
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ display: "flex", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#71717a" }}>
                Payoff at expiry
              </div>
              <div style={{ display: "flex", fontSize: 12, color: "#52525b" }}>
                {STRATEGY_EXAMPLE.underlying} @ {STRATEGY_EXAMPLE.spot.toLocaleString("en-IN")}
              </div>
            </div>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 14 }}>
              <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#3f3f46" strokeWidth={1} />
              <path d={above} fill="#10b981" opacity={0.22} stroke="none" />
              <path d={below} fill="#f43f5e" opacity={0.22} stroke="none" />
              <path d={line} fill="none" stroke="#f4f4f5" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
