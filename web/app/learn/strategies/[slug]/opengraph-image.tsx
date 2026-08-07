import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { getStrategy, STRATEGIES } from "@/lib/content/strategies";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return STRATEGIES.map((s) => ({ slug: s.slug }));
}

export default async function StrategyOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const strategy = getStrategy(slug);
  if (!strategy) notFound();

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            width: 760,
            height: 760,
            borderRadius: 9999,
            background: "rgba(0,240,255,0.09)",
            filter: "blur(150px)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid #27272a",
            background: "rgba(24,24,27,0.7)",
            borderRadius: 9999,
            padding: "10px 24px",
            fontSize: 20,
            letterSpacing: 3,
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
            marginTop: 32,
            fontSize: 64,
            fontWeight: 700,
            color: "#f4f4f5",
            textAlign: "center",
            maxWidth: 980,
            letterSpacing: -1,
          }}
        >
          {strategy.name}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 26,
            fontWeight: 600,
            color: "#00f0ff",
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          {strategy.outlook}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 46 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 10,
              border: "2px solid rgba(0,240,255,0.4)",
              background: "rgba(0,240,255,0.1)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="#00f0ff" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#f4f4f5" }}>
            <span style={{ display: "flex" }}>DELTA</span>
            <span style={{ display: "flex", color: "#00f0ff", marginLeft: -3 }}>K</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              color: "#71717a",
              letterSpacing: 1,
            }}
          >
            Quantum Horizon
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
