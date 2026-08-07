/**
 * The Z1 mark — same design language as `components/BrandIcon.tsx` (a "K"
 * and a blinking terminal cursor) — reimplemented with Satori-safe
 * primitives (`div`/`span` + inline styles, no Tailwind) so every generated
 * OG image and favicon can render the real mark instead of a static SVG
 * duplicated per file. Proportions are lifted straight from
 * `BrandIcon.tsx`'s tuned `sm`/`md`/`lg` presets (font ≈ 0.59×box, cursor
 * width 0.16×box) so the mark reads identically whether it's a 26px
 * favicon badge or a 128px apple-icon one — `box` is the full badge it
 * fills, exactly like `BrandIcon`'s `h-full w-full` in the live UI.
 */
export function BrandMark({
  box,
  color = "#00f0ff",
}: {
  box: number;
  color?: string;
}) {
  const font = box * 0.59;
  const cursorW = box * 0.16;
  const cursorH = box * 0.42;

  return (
    <div style={{ display: "flex", width: box, height: box, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ display: "flex", fontSize: font, fontWeight: 800, lineHeight: 1, color }}>K</span>
        <div style={{ display: "flex", width: cursorW, height: cursorH, marginLeft: font * 0.12, background: color }} />
      </div>
    </div>
  );
}
