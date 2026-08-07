import { ImageResponse } from "next/og";

/** Same square mark as `icon.tsx` (`rounded-md`, matching the homepage nav badge), at the size iOS actually asks for. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
            width: 128,
            height: 128,
            borderRadius: 28,
            border: "4px solid rgba(0,240,255,0.55)",
            background: "rgba(0,240,255,0.14)",
          }}
        >
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="#00f0ff" />
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}
