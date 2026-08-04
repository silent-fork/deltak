import { Activity, Layers, Users, Wrench, type LucideIcon } from "lucide-react";

import type { ForumCategoryAccent } from "./forumCategories";

/** One distinct icon per category, purely so cards read as different places rather than copies of the same card. */
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  strategy: Layers,
  "market-talk": Activity,
  feedback: Wrench,
  general: Users,
};

/**
 * The terminal's three semantic accents plus amber (already used for the
 * feed badge elsewhere in Discuss) — every value here is a complete,
 * literal Tailwind class string, never assembled by concatenating a
 * variant prefix onto a base class at a call site. Tailwind's build-time
 * scanner only picks up whole class tokens that appear verbatim in some
 * scanned file's text; a class built via template-literal interpolation
 * (e.g. `` `group-hover:${accent.text}` ``) never appears as one complete
 * token anywhere and silently produces no CSS.
 */
export const ACCENT_CLASSES: Record<
  ForumCategoryAccent,
  { border: string; bg: string; text: string; hoverBorder: string; groupHoverText: string }
> = {
  quantum: {
    border: "border-quantum/30",
    bg: "bg-quantum/10",
    text: "text-quantum",
    hoverBorder: "hover:border-quantum/40",
    groupHoverText: "group-hover:text-quantum",
  },
  aegis: {
    border: "border-aegis/30",
    bg: "bg-aegis/10",
    text: "text-aegis",
    hoverBorder: "hover:border-aegis/40",
    groupHoverText: "group-hover:text-aegis",
  },
  amber: {
    border: "border-amber-400/30",
    bg: "bg-amber-400/10",
    text: "text-amber-400",
    hoverBorder: "hover:border-amber-400/40",
    groupHoverText: "group-hover:text-amber-400",
  },
  zenith: {
    border: "border-zenith/30",
    bg: "bg-zenith/10",
    text: "text-zenith",
    hoverBorder: "hover:border-zenith/40",
    groupHoverText: "group-hover:text-zenith",
  },
};
