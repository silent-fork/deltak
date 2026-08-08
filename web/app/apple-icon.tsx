import { ImageResponse } from "next/og";

import { BrandMark } from "@/lib/og/brandMark";

/** Same bare mark as `icon.tsx` — no badge box, no border, no background tint — at the size iOS actually asks for. */
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
        <BrandMark box={160} />
      </div>
    ),
    { ...size },
  );
}
