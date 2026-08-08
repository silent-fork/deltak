import { ImageResponse } from "next/og";

import { BrandMark } from "@/lib/og/brandMark";

/**
 * Favicon, generated rather than a checked-in binary — the bare mark, no
 * badge box, no background, transparent PNG. Full-bleed, filling the
 * canvas edge to edge — most favicons in a browser tab strip do, and at
 * this size any real margin reads as "too small" next to ones that don't.
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
        <BrandMark box={32} />
      </div>
    ),
    { ...size },
  );
}
