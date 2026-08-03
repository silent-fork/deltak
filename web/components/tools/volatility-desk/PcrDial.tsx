"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/utils";
import type { IndexOptionMetrics } from "@/lib/tools/volatilityDeskTypes";

/** Semicircular arc gauge, needle at the PCR reading — rose &lt;0.7, neutral 0.7–1.3, emerald &gt;1.3. */
function Dial({ pcr }: { pcr: number }) {
  const clamped = Math.max(0.3, Math.min(2, pcr));
  const angle = -90 + ((clamped - 0.3) / (2 - 0.3)) * 180;
  const rad = (angle * Math.PI) / 180;
  const nx = 75 + 33 * Math.cos(rad);
  const ny = 80 + 33 * Math.sin(rad);
  const label = pcr >= 1.3 ? "Bullish lean" : pcr <= 0.7 ? "Bearish lean" : "Balanced";
  const color = pcr >= 1.3 ? "#10b981" : pcr <= 0.7 ? "#f43f5e" : "#e4e4e7";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="140" height="84" viewBox="0 0 150 90">
        <path d="M10 85 A65 65 0 0 1 52 24" stroke="#f43f5e" strokeWidth="10" fill="none" strokeLinecap="round" opacity="0.8" />
        <path d="M52 24 A65 65 0 0 1 98 24" stroke="#3f3f46" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d="M98 24 A65 65 0 0 1 140 85" stroke="#10b981" strokeWidth="10" fill="none" strokeLinecap="round" opacity="0.8" />
        <line x1="75" y1="80" x2={nx} y2={ny} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="75" cy="80" r="4" fill="#fff" />
      </svg>
      <div className="text-center font-mono">
        <div className="text-lg font-bold" style={{ color }}>
          {fmt(pcr)}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</div>
      </div>
    </div>
  );
}

export function PcrDials({ indices }: { indices: IndexOptionMetrics[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {indices.map((ix) => (
        <Card key={ix.underlying} className="min-h-0">
          <CardHeader>
            <CardTitle>PCR</CardTitle>
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              {ix.label}
            </span>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-2">
            <Dial pcr={ix.pcr} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
