import { ImageResponse } from "next/og";

import { BrandMark } from "@/lib/og/brandMark";

/**
 * Favicon, generated rather than a checked-in binary — the same square mark
 * (`rounded-md`, same as the homepage nav badge) as `apple-icon.tsx`, same
 * background tint, same solid canvas fill, just at the size a browser tab
 * actually asks for. No border on the badge here — at 32px a 1.5px stroke
 * reads as noise, not a frame. Without the canvas fill this rendered as a
 * transparent PNG, composited light or dark depending on the viewer — the
 * opaque canvas makes it look the same everywhere instead of drifting with
 * whatever it's shown against.
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
            borderRadius: 6,
            background: "rgba(0,240,255,0.14)",
            overflow: "hidden",
          }}
        >
          {/* A larger mark than the badge itself, clipped to its rounded
              corners — at 32px total, the mark drawn to fit the badge
              exactly left too much empty tint around it; this fills the
              badge the way the live UI's badge does. */}
          <BrandMark box={34} />
        </div>
      </div>
    ),
    { ...size },
  );
}
