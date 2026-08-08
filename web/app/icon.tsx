import { ImageResponse } from "next/og";

import { BrandMark } from "@/lib/og/brandMark";

/**
 * Favicon, generated rather than a checked-in binary — the bare mark, no
 * badge box, no background, transparent PNG. Mark sized to 80% of the
 * canvas (10% margin on every side), centered.
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
        <BrandMark box={26} />
      </div>
    ),
    { ...size },
  );
}
