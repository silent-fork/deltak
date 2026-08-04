"use client";

import { Check, Link2, Linkedin, MessageCircle, Twitter } from "lucide-react";
import { useState } from "react";

/**
 * Share intents, not SDKs — every target here is a plain `?text=`/`?url=`
 * link that opens the platform's own share dialog in a new tab, the same
 * mechanism every "share" button used before platforms started shipping
 * JS widgets for it. No tracking pixel, no third-party script loaded onto
 * a page that's otherwise clean of them.
 */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const targets = [
    {
      label: "X",
      title: "Share on X",
      href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      icon: <Twitter className="h-3.5 w-3.5" />,
    },
    {
      label: "WhatsApp",
      title: "Share on WhatsApp",
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
      icon: <MessageCircle className="h-3.5 w-3.5" />,
    },
    {
      label: "LinkedIn",
      title: "Share on LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      icon: <Linkedin className="h-3.5 w-3.5" />,
    },
    {
      label: "Reddit",
      title: "Share on Reddit",
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      icon: (
        <span className="font-mono text-[10px] font-bold leading-none">r/</span>
      ),
    },
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard permission denied — the link is still selectable from the address bar */
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {targets.map((t) => (
        <a
          key={t.label}
          href={t.href}
          target="_blank"
          rel="noopener noreferrer"
          title={t.title}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
        >
          {t.icon}
        </a>
      ))}
      <button
        type="button"
        onClick={copyLink}
        title="Copy link"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Link2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
