import { ImageResponse } from "next/og";

/**
 * Favicon, generated rather than a checked-in binary — so it's the exact
 * same quantum-cyan bolt-in-a-square mark the header, boot screen and
 * sign-in screen all render, in one place instead of four.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 7,
            border: "2px solid rgba(0,240,255,0.55)",
            background: "rgba(0,240,255,0.14)",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="#00f0ff" />
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}
