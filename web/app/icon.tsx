import { ImageResponse } from "next/og";

import { BrandMark } from "@/lib/og/brandMark";

/**
 * Favicon, generated rather than a checked-in binary — the bare mark, no
 * badge box (no border, no background tint) — just `BrandMark` on the same
 * solid canvas fill `apple-icon.tsx` uses, at the size a browser tab
 * actually asks for. Without the canvas fill this rendered as a transparent
 * PNG, composited light or dark depending on the viewer — the opaque canvas
 * makes it look the same everywhere instead of drifting with whatever it's
 * shown against.
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
        <BrandMark box={26} />
      </div>
    ),
    { ...size },
  );
}
