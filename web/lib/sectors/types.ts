import type { Quadrant, RrgPoint } from "@/lib/types";

/**
 * Shared shapes for the public F&O sector-rotation dashboard — split out of
 * `rotation.ts`/`picks.ts` (both `server-only`) so the client components and
 * `app/api/fno/sector-rotation/route.ts` can import just the types without
 * pulling a server-only module into the browser bundle.
 */

export interface SectorRotationPoint {
  label: string;
  bhavcopyName: string;
  constituentSlug: string | null;
  close: number;
  changePct: number;
  quadrant: Quadrant;
  rs_ratio: number;
  rs_momentum: number;
  tail: RrgPoint[];
}

export interface SectorRotationSnapshot {
  asOf: string;
  benchmark: { label: string; close: number; changePct: number };
  sectors: SectorRotationPoint[];
}

export interface SectorPick {
  symbol: string;
  company: string;
  lastClose: number;
  changePct: number;
  lotSize: number;
}

export interface SectorPicksEntry {
  sector: string;
  picks: SectorPick[];
}

export interface SectorRotationApiResponse extends SectorRotationSnapshot {
  picks: SectorPicksEntry[];
}
