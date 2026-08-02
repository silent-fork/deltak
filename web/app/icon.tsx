import { ImageResponse } from "next/og";

/**
 * Favicon, generated rather than a checked-in binary — so it's the exact
 * same mark the homepage nav bar renders (border-quantum/40, bg-quantum/10,
 * a plain cyan bolt), in one place instead of two.
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
            border: "1.5px solid rgba(0,240,255,0.4)",
            background: "rgba(0,240,255,0.1)",
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
