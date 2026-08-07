import { ImageResponse } from "next/og";

import { BrandMark } from "@/lib/og/brandMark";

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
          <BrandMark box={128} />
        </div>
      </div>
    ),
    { ...size },
  );
}
