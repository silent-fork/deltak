import type { CoaLevels, OptionChain } from "@/lib/types";

/**
 * View-model helpers over the COA levels.
 *
 * The engine speaks in generations — COA 1.0 is the cumulative wall carried into
 * the session, COA 2.0 the one today's writers have actually built. The HUD
 * speaks in names: a wall is "Aegis" or "Zenith", and only when the two
 * generations disagree does the older one get called out as PRIOR. A strike
 * where they agree is one wall, labelled once.
 */

export type WallSide = "aegis" | "zenith";
export type WallGeneration = "live" | "prior" | "merged";

export interface WallTag {
  key: string;
  /** Short form for the chain's strike column. */
  label: string;
  /** Long form for panels with room. */
  long: string;
  side: WallSide;
  generation: WallGeneration;
  title: string;
}

const NAME: Record<WallSide, string> = { aegis: "Aegis", zenith: "Zenith" };

const ROLE: Record<WallSide, string> = {
  aegis: "support — put writers defending below spot",
  zenith: "resistance — call writers capping above spot",
};

function tag(
  side: WallSide,
  generation: WallGeneration,
  strike: number,
): WallTag {
  const name = NAME[side];
  const merged = generation === "merged";
  const prior = generation === "prior";

  return {
    key: `${side}-${generation}`,
    label: prior ? "PRIOR" : name.toUpperCase(),
    long: prior ? `${name} prior` : name,
    side,
    generation,
    title: merged
      ? `${name} ${strike.toLocaleString("en-IN")} — ${ROLE[side]}. The cumulative and intraday walls agree here, so this is simply ${name}.`
      : prior
        ? `${name} prior ${strike.toLocaleString("en-IN")} — the cumulative wall carried into the session. Today's writers have moved ${name} elsewhere.`
        : `${name} ${strike.toLocaleString("en-IN")} — where today's writers have built the wall. This is the level the engine trades.`,
  };
}

/** Both generations of one wall, collapsed to a single tag when they coincide. */
export function wallTagsForSide(
  strike: number,
  side: WallSide,
  levels: CoaLevels,
): WallTag[] {
  const prior = side === "aegis" ? levels.aegis_0 : levels.zenith_0;
  const live = side === "aegis" ? levels.aegis_1 : levels.zenith_1;

  const atPrior = prior !== null && strike === prior;
  const atLive = live !== null && strike === live;

  if (atPrior && atLive) return [tag(side, "merged", strike)];
  if (atLive) return [tag(side, "live", strike)];
  if (atPrior) return [tag(side, "prior", strike)];
  return [];
}

export function wallTags(strike: number, levels: CoaLevels): WallTag[] {
  return [
    ...wallTagsForSide(strike, "aegis", levels),
    ...wallTagsForSide(strike, "zenith", levels),
  ];
}

/** True when a wall's two generations sit on the same strike. */
export function wallMerged(side: WallSide, levels: CoaLevels): boolean {
  const prior = side === "aegis" ? levels.aegis_0 : levels.zenith_0;
  const live = side === "aegis" ? levels.aegis_1 : levels.zenith_1;
  return prior !== null && prior === live;
}

/* ------------------------------------------------------------- distances */

/** Room to each bound, the corridor between them, and spot's place inside it. */
export function coaMetrics(chain: OptionChain) {
  const { levels, spot } = chain;
  const { aegis_1: aegis, zenith_1: zenith } = levels;

  const toSupport = aegis !== null && spot > 0 ? spot - aegis : null;
  const toResistance = zenith !== null && spot > 0 ? zenith - spot : null;
  const band = aegis !== null && zenith !== null ? zenith - aegis : null;
  const position =
    band !== null && band > 0 && aegis !== null
      ? Math.min(100, Math.max(0, ((spot - aegis) / band) * 100))
      : null;

  return { toSupport, toResistance, band, position, aegis, zenith };
}

/* ------------------------------------------------------------ wall depth */

/**
 * How much open interest actually stands at each wall, and whether it is still
 * being added to. A wall is only as good as the OI defending it: a "level" with
 * thin and unwinding OI is a level about to break.
 */
export function wallDepth(chain: OptionChain) {
  const { aegis_1: aegis, zenith_1: zenith } = chain.levels;
  const at = (strike: number | null) =>
    strike === null ? undefined : chain.rows.find((r) => r.strike === strike);

  const aegisRow = at(aegis);
  const zenithRow = at(zenith);

  const aegisOi = aegisRow?.put?.oi ?? 0;
  const zenithOi = zenithRow?.call?.oi ?? 0;
  const total = aegisOi + zenithOi;

  return {
    aegisOi,
    zenithOi,
    aegisBuild: aegisRow?.put?.oi_change ?? 0,
    zenithBuild: zenithRow?.call?.oi_change ?? 0,
    /** Share of the two walls' combined OI standing on the support side. */
    aegisShare: total > 0 ? (aegisOi / total) * 100 : 50,
  };
}

/* --------------------------------------------------------- trigger bands */

/**
 * The proximity band around each wall inside which Protocol Alpha engages.
 * Mirrors the `invalidationPct` test in the signal engine, so what the panel
 * shows as "armed" is exactly what the engine will act on.
 */
export function triggerBands(chain: OptionChain, bandPct: number) {
  const frac = bandPct / 100;
  const band = (level: number | null) =>
    level === null
      ? null
      : {
          level,
          lo: level * (1 - frac),
          hi: level * (1 + frac),
          armed: Math.abs(chain.spot - level) <= level * frac,
        };

  return {
    aegis: band(chain.levels.aegis_1),
    zenith: band(chain.levels.zenith_1),
    bandPct,
  };
}

/* -------------------------------------------------------------- pressure */

/**
 * Where the session's option writing is actually going.
 *
 * Puts written below spot are writers betting the floor holds; calls written
 * above are writers betting the ceiling does. The share between them is the
 * cleanest directional read the chain offers, and it moves well before price.
 */
export function marketPressure(chain: OptionChain) {
  let supportBuild = 0;
  let resistanceBuild = 0;
  let putOi = 0;
  let callOi = 0;

  for (const row of chain.rows) {
    if (row.put && row.strike <= chain.spot) {
      supportBuild += Math.max(0, row.put.oi_change);
      putOi += row.put.oi;
    }
    if (row.call && row.strike >= chain.spot) {
      resistanceBuild += Math.max(0, row.call.oi_change);
      callOi += row.call.oi;
    }
  }

  const total = supportBuild + resistanceBuild;
  const supportShare = total > 0 ? (supportBuild / total) * 100 : 50;
  const bias = supportShare - 50;

  return {
    supportBuild,
    resistanceBuild,
    putOi,
    callOi,
    supportShare,
    bias,
    label:
      total === 0
        ? "Balanced"
        : bias > 12
          ? "Support building"
          : bias < -12
            ? "Resistance building"
            : "Balanced",
    direction: total === 0 ? 0 : bias > 12 ? 1 : bias < -12 ? -1 : 0,
  };
}
