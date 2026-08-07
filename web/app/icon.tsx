import { ImageResponse } from "next/og";

/**
 * Favicon, generated rather than a checked-in binary — the same circular
 * mark as `apple-icon.tsx` (same border/background opacity, same solid
 * canvas fill), just at the size a browser tab actually asks for. Without
 * the fill this rendered as a transparent PNG, composited light or dark
 * depending on the viewer — the opaque canvas makes it look the same
 * everywhere instead of drifting with whatever it's shown against.
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
            borderRadius: "50%",
            border: "1.5px solid rgba(0,240,255,0.55)",
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
