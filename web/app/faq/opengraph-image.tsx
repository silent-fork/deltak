import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Quantum Horizon FAQ — DKMS strategy, limit entry, thesis tracking, risk sizing and the mobile companion, explained.";

export default function FaqOpengraphImage() {
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
            justifyContent: "center",
            width: 88,
            height: 88,
            borderRadius: 9999,
            border: "3px solid rgba(0,240,255,0.4)",
            background: "rgba(0,240,255,0.1)",
            fontSize: 44,
            fontWeight: 700,
            color: "#00f0ff",
          }}
        >
          ?
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 34,
            fontSize: 72,
            fontWeight: 700,
            color: "#f4f4f5",
            textAlign: "center",
            letterSpacing: -1,
          }}
        >
          <span style={{ display: "flex", color: "#00f0ff" }}>Quantum Horizon</span>
          ,&nbsp;decoded
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 26,
            color: "#a1a1aa",
            textAlign: "center",
            maxWidth: 820,
          }}
        >
          Every wall, rotation and thesis check DKMS runs — spelled out in plain English.
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 40 }}>
          {["Strategy", "Limit Entry", "Thesis Exit", "Risk Sizing"].map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                border: "1px solid #27272a",
                background: "rgba(24,24,27,0.6)",
                borderRadius: 8,
                padding: "10px 18px",
                fontSize: 18,
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
    ),
    { ...size },
  );
}
