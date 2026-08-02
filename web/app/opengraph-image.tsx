import { ImageResponse } from "next/og";

/**
 * The card a shared link actually shows — Slack, X, WhatsApp, iMessage all
 * read this file by convention rather than any tag in `<head>`. Same mark
 * and palette as the boot screen and sign-in screen, so a shared link and an
 * opened tab read as the same product.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "DeltaK Terminal — Angel One options trading HUD for NIFTY, BANKNIFTY and FINNIFTY futures & options";

export default function OpengraphImage() {
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
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            width: 720,
            height: 720,
            borderRadius: 9999,
            background: "rgba(0,240,255,0.10)",
            filter: "blur(140px)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 92,
              height: 92,
              borderRadius: 18,
              border: "3px solid rgba(0,240,255,0.5)",
              background: "rgba(0,240,255,0.12)",
            }}
          >
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="#00f0ff" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 88, fontWeight: 700, color: "#f4f4f5" }}>
            DELTA
            <span style={{ color: "#00f0ff" }}>K</span>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 30, fontSize: 32, color: "#a1a1aa" }}>
          Angel One Options Trading Terminal
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontSize: 22,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#71717a",
          }}
        >
          NIFTY · BANKNIFTY · FINNIFTY · Futures &amp; Options
        </div>
      </div>
    ),
    { ...size },
  );
}
