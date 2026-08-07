"use client";

import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { FAQ_CATEGORIES, type FaqItem } from "@/lib/content/faq";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * "Dynamic" in the sense that actually matters for an FAQ: filterable and
 * searchable client-side, one item open at a time, rather than a flat wall
 * of always-expanded text — the content itself still lives in
 * `lib/content/faq.ts` as a plain array, same pattern as every other
 * `/learn` content type (strategies, glossary, trading styles).
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!q) return true;
      const haystack = [item.question, ...item.answer, ...item.keywords].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query, category]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="relative w-full shrink-0 sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the FAQ…"
            className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-900/60 pl-8 pr-3 text-[12px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-quantum/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          <button
            onClick={() => setCategory(null)}
            className={cn(
              "flex h-7 items-center rounded-full border px-3 text-[10.5px] font-semibold uppercase tracking-wider transition-colors",
              category === null
                ? "border-quantum/50 bg-quantum/10 text-quantum"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
            )}
          >
            All
          </button>
          {FAQ_CATEGORIES.map((c) => (
            <button
              key={c.slug}
              onClick={() => setCategory((prev) => (prev === c.slug ? null : c.slug))}
              className={cn(
                "flex h-7 items-center rounded-full border px-3 text-[10.5px] font-semibold uppercase tracking-wider transition-colors",
                category === c.slug
                  ? "border-quantum/50 bg-quantum/10 text-quantum"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-[12px] text-zinc-500">
          Nothing matches &ldquo;{query}&rdquo; — try a different word, or clear the filter.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => {
            const open = openSlug === item.slug;
            return (
              <div
                key={item.slug}
                className="dk-panel overflow-hidden rounded-lg"
              >
                <button
                  onClick={() => {
                    const next = open ? null : item.slug;
                    setOpenSlug(next);
                    if (next) track("faq_item_open", { slug: item.slug, category: item.category });
                  }}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="text-[13.5px] font-medium text-zinc-100">{item.question}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-zinc-500 transition-transform",
                      open && "rotate-180 text-quantum",
                    )}
                  />
                </button>
                {open ? (
                  <div className="flex flex-col gap-2.5 border-t border-zinc-800/70 px-4 py-3.5 text-[12.5px] leading-relaxed text-zinc-400">
                    {item.answer.map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
