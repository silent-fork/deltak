import { ImageResponse } from "next/og";

/**
 * The card a shared link actually shows — Slack, X, WhatsApp, iMessage all
 * read this file by convention rather than any tag in `<head>`. Built as a
 * compressed echo of the homepage hero (same badge, headline shape, grid
 * background and index chips) rather than a generic centred-logo card, so a
 * shared link and the page it opens read as the same product.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "DeltaK — Quantum Horizon options trading terminal, across NIFTY, BANKNIFTY, FINNIFTY, SENSEX & BANKEX futures & options";

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

        {/* Badge — same shape as the homepage hero's */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            border: "1px solid #27272a",
            background: "rgba(24,24,27,0.7)",
            borderRadius: 9999,
            padding: "10px 24px",
            fontSize: 22,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#a1a1aa",
          }}
        >
          DeltaK Matrix Strategy · DKMS
        </div>

        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 34 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 76,
              height: 76,
              borderRadius: 16,
              // Same values as the favicon and the homepage nav icon —
              // border-quantum/40, bg-quantum/10 — so the mark is identical
              // everywhere it appears rather than its own one-off treatment.
              border: "3px solid rgba(0,240,255,0.4)",
              background: "rgba(0,240,255,0.1)",
            }}
          >
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="#00f0ff" />
            </svg>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 78,
              fontWeight: 700,
              color: "#f4f4f5",
              letterSpacing: -1,
            }}
          >
            <span style={{ display: "flex" }}>DELTA</span>
            {/* satori lays out each colour run as its own flex box, so the
                gap between "DELTA" and "K" is real box-to-box spacing, not
                inline text flow like a real browser — pulled back in with a
                negative margin rather than left as two separate words. */}
            <span style={{ display: "flex", color: "#00f0ff", marginLeft: -8 }}>
              K
            </span>
          </div>
        </div>

        {/* Headline — the same claim the homepage hero opens with */}
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: 34,
            fontWeight: 600,
            color: "#e4e4e7",
            textAlign: "center",
          }}
        >
          The DeltaK options terminal built around the&nbsp;
          <span style={{ display: "flex", color: "#00f0ff" }}>Quantum Horizon</span>
        </div>

        {/* Chips — same four the hero leads with, trimmed to what matters */}
        <div style={{ display: "flex", gap: 14, marginTop: 34 }}>
          {CHIPS.map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                border: "1px solid #27272a",
                background: "rgba(24,24,27,0.6)",
                borderRadius: 8,
                padding: "10px 18px",
                fontSize: 20,
                letterSpacing: 2,
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
