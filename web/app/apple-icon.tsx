import { ImageResponse } from "next/og";

import { BrandMark } from "@/lib/og/brandMark";

/**
 * Same bare mark as `icon.tsx` — no badge box, no background, transparent
 * PNG, sized to 80% of the canvas (10% margin on every side), centered.
 */
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
        }}
      >
        <BrandMark box={144} />
      </div>
    ),
    { ...size },
  );
}
