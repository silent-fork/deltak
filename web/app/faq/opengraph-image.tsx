import { ImageResponse } from "next/og";

import { WallDiagram } from "@/lib/og/wallDiagram";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Quantum Horizon FAQ — DKMS strategy, the 3% limit-entry discount, thesis tracking, risk sizing and the mobile companion, explained.";

export default function FaqOpengraphImage() {
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
              borderRadius: 9999,
              border: "2px solid rgba(0,240,255,0.4)",
              background: "rgba(0,240,255,0.1)",
              fontSize: 20,
              fontWeight: 700,
              color: "#00f0ff",
            }}
          >
            ?
          </div>
          <div style={{ display: "flex", fontSize: 16, color: "#71717a" }}>Quantum Horizon FAQ</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 40, marginTop: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 520 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 50,
                fontWeight: 700,
                letterSpacing: -1,
                lineHeight: 1.14,
              }}
            >
              <span style={{ display: "flex", color: "#00f0ff" }}>Quantum Horizon,</span>
              <span style={{ display: "flex", color: "#f4f4f5" }}>decoded</span>
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 20, color: "#a1a1aa", lineHeight: 1.5 }}>
              Every wall, rotation and thesis check DKMS runs — spelled out in plain English.
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 30 }}>
              {["Strategy", "Limit Entry", "Thesis Exit", "Risk Sizing"].map((chip) => (
                <div
                  key={chip}
                  style={{
                    display: "flex",
                    border: "1px solid #27272a",
                    background: "rgba(24,24,27,0.6)",
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontSize: 15,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "#71717a",
                  }}
                >
                  {chip}
                </div>
              ))}
            </div>
          </div>

          {/* The mechanic the FAQ's own deepest answer walks through — a wall
              being tested, with the 3% limit-entry discount marked on the
              path, not a generic question-mark card. */}
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
                Limit entry
              </div>
              <div style={{ display: "flex", fontSize: 12, color: "#52525b" }}>−3.0% · 900s timeout</div>
            </div>
            <div style={{ display: "flex", marginTop: 14 }}>
              <WallDiagram width={452} height={200} annotation={{ xFrac: 0.56, label: "−3% limit" }} />
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
