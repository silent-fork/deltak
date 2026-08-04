"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { renderForumMarkdown } from "@/lib/discuss/markdown";

/**
 * A long-article body renders in full in the HTML regardless of viewport —
 * the complete piece is always in the DOM, so a crawler or a reader with JS
 * off sees it all. On a narrow screen only, this visually clamps the initial
 * view to a preview height with a fade and a "Read more" toggle; at the `sm`
 * breakpoint and up there is no clamp at all, since a desktop reading column
 * has no need to hide the piece behind an extra tap.
 */
export function ArticleBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        className={
          expanded
            ? undefined
            : "relative max-h-[420px] overflow-hidden sm:max-h-none sm:overflow-visible"
        }
      >
        {renderForumMarkdown(body)}
        {!expanded ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-zinc-950 to-transparent sm:hidden"
          />
        ) : null}
      </div>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-quantum sm:hidden"
        >
          Read more
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
