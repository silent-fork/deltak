"use client";

import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Minimal modal: focus-trapped enough for a single-form dialog, closes on
 * Escape and on backdrop click.
 *
 * Rendered through a portal to `document.body` — and that is load-bearing, not
 * tidiness. This dialog is mounted from the header, which uses `backdrop-blur`,
 * and any `backdrop-filter` ancestor becomes the containing block for
 * `position: fixed`. Left in place, the overlay anchors to the header instead
 * of the viewport and the top of the form is clipped off-screen.
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("input,button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          // Cap to the viewport and scroll the body: a tall form must never
          // push its own header off the top of the screen.
          "dk-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col bg-zinc-900 shadow-quantum",
          className,
        )}
      >
        <div className="dk-panel-header shrink-0">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-quantum">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-[10px] text-zinc-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
