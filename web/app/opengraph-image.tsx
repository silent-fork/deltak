import { ImageResponse } from "next/og";

import { BrandMark } from "@/lib/og/brandMark";
import { WallDiagram } from "@/lib/og/wallDiagram";

/**
 * The card a shared link actually shows — Slack, X, WhatsApp, iMessage all
 * read this file by convention rather than any tag in `<head>`. Leads with
 * the actual mechanism (Aegis/Zenith wall migration, the thing the whole
 * strategy trades against) rather than a badge-and-chips card that could be
 * any product's homepage, so a shared link reads as "this is what it does",
 * not just "this is a product name."
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Quantum Horizon — options trading terminal running the DeltaK strategy, reading Aegis/Zenith wall migration across NIFTY, BANKNIFTY, FINNIFTY, SENSEX & BANKEX futures & options";

const CHIPS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "BANKEX"];

export default function OpengraphImage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              borderRadius: 12,
              border: "2.5px solid rgba(0,240,255,0.4)",
              background: "rgba(0,240,255,0.1)",
            }}
          >
            <BrandMark box={48} />
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#f4f4f5" }}>
            <span style={{ display: "flex" }}>DELTA</span>
            {/* satori lays out each colour run as its own flex box, so the
                gap between "DELTA" and "K" is real box-to-box spacing, not
                inline text flow like a real browser — pulled back in with a
                negative margin rather than left as two separate words. */}
            <span style={{ display: "flex", color: "#00f0ff", marginLeft: -4 }}>K</span>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 40, marginTop: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 520 }}>
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
              DeltaK Matrix Strategy · DKMS
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 22,
                fontSize: 44,
                fontWeight: 700,
                letterSpacing: -1,
                lineHeight: 1.16,
              }}
            >
              <span style={{ display: "flex", color: "#00f0ff" }}>Quantum Horizon</span>
              <span style={{ display: "flex", color: "#f4f4f5" }}>the options terminal running DKMS</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 30 }}>
              {CHIPS.map((chip) => (
                <div
                  key={chip}
                  style={{
                    display: "flex",
                    border: "1px solid #27272a",
                    background: "rgba(24,24,27,0.6)",
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontSize: 15,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    color: "#71717a",
                  }}
                >
                  {chip}
                </div>
              ))}
            </div>
          </div>

          {/* The actual wall-migration mechanic, not a stand-in graphic */}
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
                Wall migration, live
              </div>
              <div style={{ display: "flex", fontSize: 12, color: "#52525b" }}>COA · RRG</div>
            </div>
            <div style={{ display: "flex", marginTop: 14 }}>
              <WallDiagram width={452} height={200} />
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
