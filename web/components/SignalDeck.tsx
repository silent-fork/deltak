"use client";

import { useState } from "react";

import { OiBuildupPanel } from "@/components/OiBuildupPanel";
import { SignalPanel } from "@/components/SignalPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import type {
  OiBuildupExpiry,
  OiBuildupType,
} from "@/lib/market/constants";
import type { ExecutionMode, OiBuildupRow, Signal } from "@/lib/types";
import { PROTOCOL_META, cn } from "@/lib/utils";

/**
 * One frame for the two reads that decide an entry.
 *
 * The signal engine says what this index's chain justifies; the buildup board
 * says what the rest of the F&O market is doing about it. They answer the same
 * question at different scales, they are never both acted on at once, and the
 * column has room for one panel — so they share a frame and a tab strip rather
 * than competing for the same pixels.
 */

type Deck = "signal" | "buildup";

export function SignalDeck({
  signal,
  mode,
  onExecuted,
  buildup,
  buildupType,
  buildupExpiry,
  buildupAt,
  marketAvailable,
  focus,
  onBuildupType,
  onBuildupExpiry,
}: {
  signal: Signal | undefined;
  mode: ExecutionMode;
  onExecuted: () => void;
  buildup: OiBuildupRow[];
  buildupType: OiBuildupType;
  buildupExpiry: OiBuildupExpiry;
  buildupAt: string | null;
  marketAvailable: boolean;
  focus: string;
  onBuildupType: (t: OiBuildupType) => void;
  onBuildupExpiry: (e: OiBuildupExpiry) => void;
}) {
  const [deck, setDeck] = useState<Deck>("signal");
  const meta = signal ? PROTOCOL_META[signal.protocol] : null;

  return (
    <Card className="min-h-0 xl:basis-0 xl:grow-[5]">
      <CardHeader className="shrink-0">
        <div className="flex min-w-0 items-center gap-1">
          {(
            [
              ["signal", "Delta-K Signal Engine"],
              ["buildup", "OI Buildup"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDeck(key)}
              aria-pressed={deck === key}
              className={cn(
                "truncate rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors",
                deck === key
                  ? "border-quantum/50 bg-quantum/10 text-quantum"
                  : "border-transparent text-zinc-500 hover:text-zinc-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* The protocol is the engine's headline state, so it stays visible
            even while the buildup board is the one being read. */}
        {meta ? (
          <Badge className={cn("shrink-0 font-semibold", meta.tone)}>
            Protocol {meta.name}
          </Badge>
        ) : null}
      </CardHeader>

      {deck === "signal" ? (
        <SignalPanel signal={signal} mode={mode} onExecuted={onExecuted} />
      ) : (
        <OiBuildupPanel
          rows={buildup}
          type={buildupType}
          expiry={buildupExpiry}
          updatedAt={buildupAt}
          available={marketAvailable}
          focus={focus}
          onType={onBuildupType}
          onExpiry={onBuildupExpiry}
        />
      )}
    </Card>
  );
}
