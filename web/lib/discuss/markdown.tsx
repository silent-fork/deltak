import type { ReactNode } from "react";

/**
 * A small, dependency-free markdown-ish renderer for forum post bodies —
 * not a CommonMark implementation, just the handful of block and inline
 * forms the toolbar in `RichTextEditor` actually writes: headings, lists,
 * blockquotes, code blocks/spans, bold/italic/strikethrough, links, and
 * images (the "GIF by URL" feature rides on the same image syntax).
 *
 * Deliberately builds React elements directly rather than parsing to an
 * HTML string and using `dangerouslySetInnerHTML` — every post body here
 * is untrusted user content on a publicly-readable collection, and React's
 * own text-node escaping is what keeps that safe with zero sanitization
 * code to get wrong. Link/image URLs are restricted to http(s) so a
 * `javascript:` or `data:` URL typed into the editor can't do anything.
 */

let keySeq = 0;
const nextKey = () => `md-${keySeq++}`;

const SAFE_URL = /^https?:\/\//i;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: images before links (both use `[...](...)`, image has a
  // leading `!`), bold before italic (so `**x**` doesn't parse as two
  // single-`*` italics first).
  const pattern =
    /!\[([^\]]*)\]\((\S+?)\)|\[([^\]]*)\]\((\S+?)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      // image / GIF
      if (SAFE_URL.test(m[2])) {
        nodes.push(
          // eslint-disable-next-line @next/next/no-img-element -- user-posted GIF/image URLs, arbitrary hosts
          <img
            key={nextKey()}
            src={m[2]}
            alt={m[1]}
            loading="lazy"
            className="my-1 max-h-80 max-w-full rounded-md border border-zinc-800"
          />,
        );
      } else {
        nodes.push(m[0]);
      }
    } else if (m[3] !== undefined) {
      // link
      nodes.push(
        SAFE_URL.test(m[4]) ? (
          <a
            key={nextKey()}
            href={m[4]}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="text-quantum underline decoration-quantum/40 underline-offset-2 hover:decoration-quantum"
          >
            {m[3]}
          </a>
        ) : (
          m[0]
        ),
      );
    } else if (m[5] !== undefined) {
      nodes.push(<strong key={nextKey()}>{m[5]}</strong>);
    } else if (m[6] !== undefined) {
      nodes.push(<del key={nextKey()}>{m[6]}</del>);
    } else if (m[7] !== undefined) {
      nodes.push(
        <code key={nextKey()} className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[0.92em] text-quantum">
          {m[7]}
        </code>,
      );
    } else if (m[8] !== undefined) {
      nodes.push(<em key={nextKey()}>{m[8]}</em>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

function renderBlock(block: string): ReactNode {
  if (block.startsWith("```")) {
    const inner = block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
    return (
      <pre
        key={nextKey()}
        className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900/70 p-3 font-mono text-[12px] leading-relaxed text-zinc-300"
      >
        <code>{inner}</code>
      </pre>
    );
  }

  const lines = block.split("\n");

  if (lines.every((l) => BULLET.test(l) || l.trim() === "")) {
    const items = lines.filter((l) => l.trim() !== "");
    return (
      <ul key={nextKey()} className="list-disc space-y-1 pl-5">
        {items.map((l) => (
          <li key={nextKey()}>{renderInline(l.match(BULLET)![1])}</li>
        ))}
      </ul>
    );
  }

  if (lines.every((l) => NUMBERED.test(l) || l.trim() === "")) {
    const items = lines.filter((l) => l.trim() !== "");
    return (
      <ol key={nextKey()} className="list-decimal space-y-1 pl-5">
        {items.map((l) => (
          <li key={nextKey()}>{renderInline(l.match(NUMBERED)![1])}</li>
        ))}
      </ol>
    );
  }

  if (lines.every((l) => QUOTE.test(l) || l.trim() === "")) {
    const text = lines.map((l) => l.match(QUOTE)?.[1] ?? "").join("\n");
    return (
      <blockquote
        key={nextKey()}
        className="whitespace-pre-wrap border-l-2 border-zinc-700 pl-3 italic text-zinc-400"
      >
        {renderInline(text)}
      </blockquote>
    );
  }

  const heading = lines.length === 1 ? lines[0].match(HEADING) : null;
  if (heading) {
    const level = heading[1].length;
    const sizes: Record<number, string> = {
      1: "text-2xl font-bold",
      2: "text-xl font-bold",
      3: "text-lg font-semibold",
    };
    const cls = sizes[Math.min(level, 3)] ?? "text-base font-semibold";
    const Tag = (`h${Math.min(level, 6)}` as unknown) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return (
      <Tag key={nextKey()} className={`${cls} text-zinc-100`}>
        {renderInline(heading[2])}
      </Tag>
    );
  }

  return (
    <p key={nextKey()} className="whitespace-pre-wrap">
      {renderInline(block)}
    </p>
  );
}

/** Renders one post/article body's worth of markdown-ish text into a flex column of block elements. */
export function renderForumMarkdown(body: string): ReactNode {
  const blocks = body.split(/\n{2,}/).filter((b) => b.trim() !== "");
  return <div className="flex flex-col gap-3">{blocks.map(renderBlock)}</div>;
}
