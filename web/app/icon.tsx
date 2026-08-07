import { ImageResponse } from "next/og";

import { BrandMark } from "@/lib/og/brandMark";

/**
 * Favicon, generated rather than a checked-in binary — the same square mark
 * (`rounded-md`, same as the homepage nav badge) as `apple-icon.tsx`, same
 * border/background opacity, same solid canvas fill, just at the size a
 * browser tab actually asks for. Without the fill this rendered as a
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
            border: "1.5px solid rgba(0,240,255,0.55)",
            background: "rgba(0,240,255,0.14)",
          }}
        >
          <BrandMark box={26} />
        </div>
      </div>
    ),
    { ...size },
  );
}
