"use client";

import {
  Bold,
  Code,
  Eye,
  EyeOff,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Smile,
  Strikethrough,
} from "lucide-react";
import { useRef, useState } from "react";

import { renderForumMarkdown } from "@/lib/discuss/markdown";

/**
 * Formatting toolbar + textarea for both `NewThreadForm` and `ReplyForm` —
 * a plain `<textarea>` underneath (its value is still ordinary markdown-ish
 * text, exactly what `lib/server/forum.ts` already validates and stores),
 * with toolbar buttons that splice markdown syntax into the current
 * selection rather than a contenteditable WYSIWYG surface. No new
 * dependency: this app already avoids the `firebase` SDK on the same
 * "fewer moving parts, REST/DOM primitives are enough" grounds.
 *
 * GIFs are "paste a URL" rather than an in-app search — a real GIF search
 * needs a Giphy/Tenor API key this app doesn't have configured; any GIF or
 * image URL (Giphy/Tenor share links included) renders inline via the same
 * `![alt](url)` syntax `lib/discuss/markdown.tsx` already draws images from.
 */

const EMOJI = [
  "😀", "😂", "😅", "😉", "😊", "😍", "🤔", "😐", "😴", "😭",
  "😡", "🤯", "😎", "🥲", "😱", "🎉", "👍", "👎", "👏", "🙏",
  "💪", "🔥", "💯", "🚀", "📈", "📉", "💰", "💸", "🤑", "🐂",
  "🐻", "⚠️", "✅", "❌", "🎯", "🧠", "👀", "🙌", "🤝", "⏰",
  "💡", "❤️", "😂", "🤷", "🙄", "😬", "🤦", "👌",
];

interface Selection {
  next: string;
  selStart: number;
  selEnd: number;
}

function wrapSelection(el: HTMLTextAreaElement, prefix: string, suffix: string, placeholder: string): Selection {
  const { selectionStart, selectionEnd, value } = el;
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const next = `${before}${prefix}${selected}${suffix}${after}`;
  return { next, selStart: before.length + prefix.length, selEnd: before.length + prefix.length + selected.length };
}

function prefixLines(el: HTMLTextAreaElement, makePrefix: (lineIndex: number) => string): Selection {
  const { selectionStart, selectionEnd, value } = el;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  let lineEnd = value.indexOf("\n", selectionEnd);
  if (lineEnd === -1) lineEnd = value.length;
  const before = value.slice(0, lineStart);
  const segment = value.slice(lineStart, lineEnd);
  const after = value.slice(lineEnd);
  const prefixed = segment
    .split("\n")
    .map((l, i) => makePrefix(i) + l)
    .join("\n");
  const next = before + prefixed + after;
  return { next, selStart: lineStart, selEnd: lineStart + prefixed.length };
}

function insertAtCursor(el: HTMLTextAreaElement, text: string): Selection {
  const { selectionStart, selectionEnd, value } = el;
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const next = `${before}${text}${after}`;
  return { next, selStart: before.length + text.length, selEnd: before.length + text.length };
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [preview, setPreview] = useState(false);

  function apply(op: (el: HTMLTextAreaElement) => Selection) {
    const el = ref.current;
    if (!el) return;
    const { next, selStart, selEnd } = op(el);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  const btn = "flex h-7 w-7 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-950/60 p-1">
        <button type="button" title="Bold" className={btn} onClick={() => apply((el) => wrapSelection(el, "**", "**", "bold text"))}>
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Italic" className={btn} onClick={() => apply((el) => wrapSelection(el, "*", "*", "italic text"))}>
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Strikethrough" className={btn} onClick={() => apply((el) => wrapSelection(el, "~~", "~~", "struck text"))}>
          <Strikethrough className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Inline code" className={btn} onClick={() => apply((el) => wrapSelection(el, "`", "`", "code"))}>
          <Code className="h-3.5 w-3.5" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-zinc-800" />
        <button type="button" title="Heading" className={btn} onClick={() => apply((el) => prefixLines(el, () => "## "))}>
          <Heading2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Quote" className={btn} onClick={() => apply((el) => prefixLines(el, () => "> "))}>
          <Quote className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Bulleted list" className={btn} onClick={() => apply((el) => prefixLines(el, () => "- "))}>
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Numbered list"
          className={btn}
          onClick={() => apply((el) => prefixLines(el, (i) => `${i + 1}. `))}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Code block"
          className={btn}
          onClick={() => apply((el) => wrapSelection(el, "```\n", "\n```", "code here"))}
        >
          <SquareCode className="h-3.5 w-3.5" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-zinc-800" />
        <button
          type="button"
          title="Link"
          className={btn}
          onClick={() => {
            const url = window.prompt("Link URL (https://…)");
            if (!url) return;
            apply((el) => wrapSelection(el, "[", `](${url})`, "link text"));
          }}
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="GIF or image URL"
          className={btn}
          onClick={() => {
            const url = window.prompt("GIF or image URL (https://…) — paste a Giphy/Tenor link or any direct image URL");
            if (!url) return;
            apply((el) => insertAtCursor(el, `![gif](${url})`));
          }}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </button>
        <div className="relative">
          <button
            type="button"
            title="Emoji"
            className={btn}
            onClick={() => setShowEmoji((s) => !s)}
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
          {showEmoji ? (
            <div className="absolute left-0 top-8 z-20 grid w-64 grid-cols-8 gap-0.5 rounded-md border border-zinc-800 bg-zinc-950 p-2 shadow-xl">
              {EMOJI.map((e, i) => (
                <button
                  key={`${e}-${i}`}
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-white/10"
                  onClick={() => {
                    apply((el) => insertAtCursor(el, e));
                    setShowEmoji(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <span className="mx-0.5 h-4 w-px bg-zinc-800" />
        <button
          type="button"
          title={preview ? "Edit" : "Preview"}
          className={`${btn} ${preview ? "bg-quantum/15 text-quantum" : ""}`}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>

      {preview ? (
        <div className="min-h-[80px] rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] leading-relaxed text-zinc-300">
          {value.trim() ? renderForumMarkdown(value) : (
            <p className="text-zinc-600">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          required
          rows={rows}
          className="resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-quantum/50"
        />
      )}
    </div>
  );
}
