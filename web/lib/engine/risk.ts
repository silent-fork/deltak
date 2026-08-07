import type {
  CoaLevels,
  OptionChain,
  OptionType,
  Position,
  Protocol,
  Quadrant,
  RiskEvent,
  ScaleInDecision,
  Side,
} from "@/lib/types";
import type { VixRegime } from "@/lib/tools/volatilityDeskTypes";
import type { Ledger } from "./ledger";
import type { RrgEngine } from "./rrg";
import type { EngineConfig } from "./config";
import { effectiveConfig, isWeekend, istMinutes, MARKET_CLOSE_MIN, secondsToDaylightRest } from "./config";

/**
 * Capital-preservation circuit breakers — port of `backend/app/risk.py`.
 *
 * **Behavioural difference from the Python engine, stated plainly:** these run in
 * the browser on a 1 Hz timer, so they only fire while the tab is open. A server
 * process guarded positions around the clock; this build does not. Do not leave
 * positions open with the terminal closed.
 */

/**
 * COA 2.0 wall-shift regime classification — lives here (not `dkms.ts`,
 * protocol classification's original home) because `thesisIntact` below
 * needs it too, and `dkms.ts` already needs `wallStopPoints` from this
 * file; the other direction would be a risk.ts <-> dkms.ts import cycle.
 * Re-exported from `dkms.ts` so existing callers there are unaffected.
 */
export function classifyProtocol(levels: CoaLevels, tolerance: number): Protocol {
  if (levels.aegis_1 === null || levels.zenith_1 === null) return "DELTA";

  const supportSolid = Math.abs(levels.aegis_shift) <= tolerance;
  const resistanceSolid = Math.abs(levels.zenith_shift) <= tolerance;
  const resistanceUp = levels.zenith_shift > tolerance;
  const supportDown = levels.aegis_shift < -tolerance;

  if (supportSolid && resistanceSolid) return "ALPHA";
  if (supportSolid && resistanceUp) return "BETA";
  if (resistanceSolid && supportDown) return "GAMMA";
  return "DELTA";
}

export type ExitFn = (
  position: Position,
  reason: string,
) => Promise<void> | void;

export type ScaleFn = (position: Position, fraction: number) => Promise<void> | void;

export type TrailFn = (position: Position, newStop: number) => Promise<void> | void;

/** True when spot has breached *level* by more than the invalidation band. */
export function breach(
  spot: number,
  level: number | null,
  direction: "below" | "above",
  invalidationPct: number,
): boolean {
  if (!level || level <= 0 || spot <= 0) return false;
  const band = level * (invalidationPct / 100);
  return direction === "below" ? spot < level - band : spot > level + band;
}

/**
 * Distance, in approximate *premium* points, from `spot` to the same level
 * `checkInvalidation`/`breach` would fire this option side's exit at — the
 * shared primitive behind both the entry-time wall-anchored stop
 * (`SignalEngine.evaluate`, `lib/engine/dkms.ts`) and this file's own
 * `checkWallTrail`. A CE long is anchored to Aegis-1 (support) minus its
 * own invalidation band; a PE long to Zenith-1 (resistance) plus its band —
 * exactly the pairing `checkInvalidation` uses. `itmDeltaApprox` translates
 * the underlying-point distance into an approximate premium distance (see
 * its own doc comment in `config.ts` — a stated approximation, not a real
 * Greek).
 *
 * Returns `null` when there's no wall to anchor to yet, or spot is already
 * through the invalidation band — that's `checkInvalidation`'s own exit to
 * own, not a stop or trail derived from it.
 */
export function wallStopPoints(params: {
  optionType: OptionType;
  spot: number;
  aegis1: number | null;
  zenith1: number | null;
  invalidationPct: number;
  itmDeltaApprox: number;
}): number | null {
  const { optionType, spot, aegis1, zenith1, invalidationPct, itmDeltaApprox } = params;
  const level = optionType === "CE" ? aegis1 : zenith1;
  if (level === null || level <= 0 || spot <= 0) return null;

  const band = level * (invalidationPct / 100);
  const invalidationLevel = optionType === "CE" ? level - band : level + band;
  const distance = optionType === "CE" ? spot - invalidationLevel : invalidationLevel - spot;
  if (distance <= 0) return null;

  return distance * itmDeltaApprox;
}

export type ExitReason = "STOP_LOSS" | "TARGET" | "DAYLIGHT_REST";
export type ExitDecision = { action: ExitReason } | { action: "HOLD" };

/**
 * What a single position's own numbers say to do, given a fresh LTP — the
 * same stop/target priority `checkStops` uses, plus the Daylight Rest clock
 * event, folded into one pure decision.
 *
 * This is what lets a background job reach the same verdict `runGuards`
 * would without needing a live `Ledger`, an option chain, or an RRG window —
 * a position's own stop, target and side, plus one price, is the whole input.
 * Invalidation (needs the COA walls) and the Weakening-quadrant scale-out
 * (needs live rotation) are not decidable this way — they stay browser-only
 * until there is a server-side home for that state.
 */
export function decideExit(params: {
  side: Side;
  stopLoss: number | null;
  target: number | null;
  ltp: number;
  /** Past 3:15 PM IST, within today's session — `secondsToDaylightRest() <= 0` and the session hasn't closed. */
  daylightRestDue: boolean;
}): ExitDecision {
  const long = params.side === "BUY";

  if (params.stopLoss !== null) {
    const hit = long ? params.ltp <= params.stopLoss : params.ltp >= params.stopLoss;
    if (hit) return { action: "STOP_LOSS" };
  }
  if (params.target !== null) {
    const hit = long ? params.ltp >= params.target : params.ltp <= params.target;
    if (hit) return { action: "TARGET" };
  }
  if (params.daylightRestDue) return { action: "DAYLIGHT_REST" };
  return { action: "HOLD" };
}

/**
 * Breakeven-then-trail: once a position has moved favourably by at least
 * one risk-multiple (R — the premium distance its stop originally sized
 * against, reconstructed from its own `protocol`'s configured stop%, see
 * `EngineConfig.stopPctByProtocol`), the stop ratchets to breakeven — the
 * trade can no longer close at a loss. Past 2R it trails a further R
 * behind the current price instead of sitting fixed at breakeven forever.
 *
 * Needs only a position's own numbers and a fresh price — same shape as
 * `decideExit` and for the same reason: a background job can reach the
 * identical verdict without a live COA chain or RRG window, so unlike
 * invalidation and the Weakening scale-out, trailing can run in the
 * server watchdog too.
 *
 * Returns the new stop only when it's an actual improvement (mirrors
 * `Ledger.tightenStop`'s own one-way check) — `null` means nothing to do,
 * so a caller can invoke this every tick with no extra bookkeeping.
 */
export function decideTrail(params: {
  side: Side;
  avgPrice: number;
  stopLoss: number | null;
  ltp: number;
  /** The premium distance this position's stop was originally sized against — its "1R". */
  riskPoints: number;
}): number | null {
  const { side, avgPrice, stopLoss, ltp, riskPoints } = params;
  if (riskPoints <= 0 || ltp <= 0 || avgPrice <= 0) return null;

  const long = side === "BUY";
  const favourableMove = long ? ltp - avgPrice : avgPrice - ltp;
  if (favourableMove < riskPoints) return null; // not yet breakeven-eligible

  let candidate = avgPrice;
  if (favourableMove >= riskPoints * 2) {
    const trailing = long ? ltp - riskPoints : ltp + riskPoints;
    candidate = long ? Math.max(candidate, trailing) : Math.min(candidate, trailing);
  }

  const improves = long
    ? stopLoss === null || candidate > stopLoss
    : stopLoss === null || candidate < stopLoss;
  return improves ? Number(candidate.toFixed(2)) : null;
}

/**
 * Whether an open, winning position has earned a single manually-triggered
 * add-on — Phase 4. Never proposed by Autopilot, and the caller is expected
 * to check this at most once per position per session (see `useEngine`'s
 * own `scaledIn` set — the same in-memory-only posture `checkWeakeningRotation`'s
 * `scaled` set already uses for the opposite action): a position that has
 * already been added to must not be added to again just because it keeps
 * trending favourably.
 *
 * Gated on all of:
 *  - still in a strong RRG quadrant (LEADING/IMPROVING) — a WEAKENING node
 *    is `checkWeakeningRotation`'s to scale *out* of, never a candidate to add to.
 *  - at least 1R favourable already (the same threshold `decideTrail` uses
 *    to lock breakeven) — adding to a position that hasn't even earned back
 *    its own risk yet is pyramiding into an unconfirmed move.
 *  - the wall it was anchored to at entry is still intact with room left
 *    (`wallStopPoints` returning `null` — breached or not yet known — refuses).
 *  - VIX isn't in Panic — the one regime the sizing table already treats as
 *    "shrink risk", not "add more".
 *
 * `newStop`/`newTarget` re-anchor to the *blended* average price this add
 * would produce, preserving the original position's risk distance and
 * target distance rather than leaving the old absolute levels sitting
 * against a now-cheaper cost basis.
 *
 * Capital affordability is deliberately NOT this function's job — `addLots`
 * here only proposes doubling the position's existing size; the caller
 * (`useEngine`'s `scaleInPosition`) re-checks portfolio risk and available
 * capital against the live ledger immediately before actually filling, the
 * same way `executeSignal` does for a fresh entry.
 */
export function decideScaleIn(params: {
  pos: Position;
  ltp: number;
  spot: number;
  aegis1: number | null;
  zenith1: number | null;
  quadrant: Quadrant | null;
  vixRegime: VixRegime | null;
  alreadyScaledIn: boolean;
  cfg: EngineConfig;
}): ScaleInDecision | null {
  const { pos, ltp, spot, aegis1, zenith1, quadrant, vixRegime, alreadyScaledIn, cfg } = params;
  if (alreadyScaledIn) return null;
  if (!pos.option_type || !pos.protocol || pos.protocol === "DELTA") return null;
  if (quadrant !== "LEADING" && quadrant !== "IMPROVING") return null;
  if (vixRegime === "Panic") return null;
  if (ltp <= 0) return null;

  const riskPoints = riskPointsFor(pos, cfg);
  if (riskPoints === null || riskPoints <= 0) return null;

  const long = pos.side === "BUY";
  const favourableMove = long ? ltp - pos.avg_price : pos.avg_price - ltp;
  if (favourableMove < riskPoints) return null; // hasn't earned back its own risk yet

  const wallPoints = wallStopPoints({
    optionType: pos.option_type,
    spot,
    aegis1,
    zenith1,
    invalidationPct: cfg.invalidationPct,
    itmDeltaApprox: cfg.itmDeltaApprox,
  });
  if (wallPoints === null) return null; // wall breached, or not known yet — no room to add safely

  const addLots = pos.lots;
  const addQty = addLots * pos.lot_size;
  const blendedAvg = (pos.avg_price * pos.quantity + ltp * addQty) / (pos.quantity + addQty);
  const newStop = Number((long ? blendedAvg - wallPoints : blendedAvg + wallPoints).toFixed(2));
  const newTarget =
    pos.target !== null
      ? Number(
          (long
            ? blendedAvg + (pos.target - pos.avg_price)
            : blendedAvg - (pos.avg_price - pos.target)
          ).toFixed(2),
        )
      : null;

  return {
    addLots,
    newStop,
    newTarget,
    reason: `${pos.trading_symbol} up ${(favourableMove / riskPoints).toFixed(1)}R in ${quadrant.toLowerCase()} — room to add ${addLots} lot(s).`,
  };
}

export interface GuardDeps {
  ledger: Ledger;
  chains: Record<string, OptionChain>;
  rrg: Record<string, RrgEngine>;
  cfg: EngineConfig;
  ltp: (token: string) => number;
  exit: ExitFn;
  scaleOut: ScaleFn;
  trail: TrailFn;
  log: (kind: RiskEvent["kind"], message: string, underlying?: string) => void;
  /** Position ids already scaled out once. */
  scaled: Set<string>;
  daylightRestDone: boolean;
  onDaylightRestDone: () => void;
}

/** Book stop-loss and target exits from live premium marks. */
export async function checkStops(d: GuardDeps): Promise<void> {
  for (const pos of d.ledger.openPositions) {
    const ltp = d.ltp(pos.token);
    if (ltp <= 0) continue;
    const long = pos.side === "BUY";

    if (pos.stop_loss !== null) {
      const hit = long ? ltp <= pos.stop_loss : ltp >= pos.stop_loss;
      if (hit) {
        d.log(
          "STOP_LOSS",
          `Stop hit on ${pos.trading_symbol} @ ${ltp.toFixed(2)} (stop ${pos.stop_loss.toFixed(2)}) — liquidating.`,
          pos.underlying,
        );
        await d.exit(pos, "STOP_LOSS");
        continue;
      }
    }
    if (pos.target !== null) {
      const hit = long ? ltp >= pos.target : ltp <= pos.target;
      if (hit) {
        d.log("TARGET", `Target hit on ${pos.trading_symbol} @ ${ltp.toFixed(2)} — booking.`, pos.underlying);
        await d.exit(pos, "TARGET");
      }
    }
  }
}

/** Index break invalidation against the COA 2.0 bounds — invalidationPct itself is per-index, see `effectiveConfig`. */
export async function checkInvalidation(d: GuardDeps): Promise<void> {
  for (const [underlying, chain] of Object.entries(d.chains)) {
    if (!chain || chain.spot <= 0) continue;
    const { levels } = chain;
    const invalidationPct = effectiveConfig(underlying, d.cfg).invalidationPct;
    const supportBroken = breach(chain.spot, levels.aegis_1, "below", invalidationPct);
    const resistanceBroken = breach(chain.spot, levels.zenith_1, "above", invalidationPct);
    if (!supportBroken && !resistanceBroken) continue;

    for (const pos of d.ledger.positionsFor(underlying)) {
      const invalid =
        (supportBroken && pos.option_type === "CE" && pos.side === "BUY") ||
        (resistanceBroken && pos.option_type === "PE" && pos.side === "BUY");
      if (!invalid) continue;

      const level = supportBroken ? levels.aegis_1 : levels.zenith_1;
      const label = supportBroken ? "Aegis-1" : "Zenith-1";
      d.log(
        "INVALIDATION",
        `${underlying} spot ${chain.spot.toLocaleString("en-IN")} breached ${label} ${level?.toLocaleString("en-IN")} ` +
          `by >${invalidationPct}% — liquidating ${pos.trading_symbol}.`,
        underlying,
      );
      await d.exit(pos, "INVALIDATION");
    }
  }
}

/**
 * True when the SAME classification a position (or a still-pending limit
 * order) was opened under still holds, re-checked live against the current
 * chain — the entry-time mirror of `classifyProtocol`'s own conditions for
 * ALPHA's near-wall band, BETA and GAMMA. Deliberately tighter and faster
 * to fire than `checkInvalidation`'s `invalidationPct` band: that one waits
 * for spot to travel a real distance past the wall, this one fires the
 * moment the *regime read itself* changes, which is usually well before
 * price has moved that far. Both stay active side by side — see
 * `EngineConfig.thesisExit`'s own doc comment for why neither replaces the
 * other.
 *
 * `null`/no-data reads permissive (`true`), the same posture every other
 * guard in this file takes when it can't tell — a missing chain is not
 * evidence the thesis broke.
 */
export function thesisIntact(
  underlying: string,
  protocol: Protocol,
  optionType: OptionType,
  chain: OptionChain | null | undefined,
  cfg: EngineConfig,
): boolean {
  if (!chain || chain.spot <= 0) return true;
  const current = classifyProtocol(chain.levels, cfg.levelShiftTolerance);

  if (protocol === "BETA") return current === "BETA";
  if (protocol === "GAMMA") return current === "GAMMA";
  if (protocol === "ALPHA") {
    if (current !== "ALPHA") return false;
    const band = effectiveConfig(underlying, cfg).alphaEntryBandPct / 100;
    const { spot } = chain;
    const { aegis_1, zenith_1 } = chain.levels;
    return optionType === "CE"
      ? aegis_1 !== null && Math.abs(spot - aegis_1) <= aegis_1 * band
      : zenith_1 !== null && Math.abs(spot - zenith_1) <= zenith_1 * band;
  }
  return true; // DELTA never opens a position; an unrecognised protocol reads permissive
}

/**
 * Live positions' own thesis-exit guard — see `thesisIntact` above and
 * `EngineConfig.thesisExit`'s doc comment. The equivalent check for a
 * still-*pending* limit order (cancel rather than exit) lives in
 * `useEngine.ts`'s `processPendingEntries`, since a not-yet-open order has
 * no `Ledger` position for this guard's `d.ledger.openPositions` to reach.
 */
export async function checkThesisBroken(d: GuardDeps): Promise<void> {
  if (!d.cfg.thesisExit) return;
  for (const pos of d.ledger.openPositions) {
    if (!pos.protocol || pos.protocol === "DELTA" || !pos.option_type) continue;
    const chain = d.chains[pos.underlying];
    if (thesisIntact(pos.underlying, pos.protocol, pos.option_type, chain, d.cfg)) continue;

    d.log(
      "THESIS_BROKEN",
      `${pos.trading_symbol} thesis broken — ${pos.protocol} no longer reads at ${pos.underlying} — liquidating.`,
      pos.underlying,
    );
    await d.exit(pos, "THESIS_BROKEN");
  }
}

/**
 * True when the underlying has actually moved against `optionType` since
 * entry, rather than the option's own premium simply having drifted.
 *
 * A deep-ITM long's premium is dominated by intrinsic value, so on a flat
 * tape the only thing still moving it is theta — a slow, steady decay the RRG
 * engine cannot distinguish from genuine momentum fading, because it only
 * ever sees the premium series. Requiring a real adverse move in the index
 * itself keeps a quiet, sideways session from reading as a rotation.
 */
export function weakeningCorroborated(
  optionType: "CE" | "PE" | null,
  entrySpot: number,
  spot: number,
  minAdverseMovePct: number,
): boolean {
  if (entrySpot <= 0 || spot <= 0) return true; // no baseline to check against
  const band = entrySpot * (minAdverseMovePct / 100);
  return optionType === "PE" ? spot > entrySpot + band : spot < entrySpot - band;
}

/**
 * Automated TP1 scale-out when a held node rotates into Weakening.
 *
 * A 1-lot position can't be reduced (the exchange only trades whole lots),
 * which used to mean the rotation was silently skipped — the position rode
 * out unmodified whatever conviction triggered a scale-out on a 2+-lot
 * position. It falls back to locking the stop to breakeven instead: it
 * can't take money off the table, but it can guarantee the trade won't give
 * back what it's already up.
 */
export async function checkWeakeningRotation(d: GuardDeps): Promise<void> {
  for (const pos of d.ledger.openPositions) {
    if (d.scaled.has(pos.id)) continue;
    if (d.rrg[pos.underlying]?.quadrant(pos.token) !== "WEAKENING") continue;
    if (pos.unrealised_pnl <= 0) continue; // only scale out of a winner

    if (pos.entry_spot !== null) {
      const spot = d.chains[pos.underlying]?.spot ?? 0;
      const corroborated = weakeningCorroborated(
        pos.option_type,
        pos.entry_spot,
        spot,
        effectiveConfig(pos.underlying, d.cfg).weakeningMinAdverseMovePct,
      );
      if (!corroborated) continue; // premium drifted, spot did not — theta, not rotation
    }

    if (pos.lots < 2) {
      d.log(
        "TARGET",
        `${pos.trading_symbol} rotated into Weakening at 1 lot — locking the stop to breakeven instead of scaling out.`,
        pos.underlying,
      );
      await d.trail(pos, pos.avg_price);
      d.scaled.add(pos.id);
      continue;
    }

    d.log("TARGET", `${pos.trading_symbol} rotated into Weakening — TP1 scale-out.`, pos.underlying);
    await d.scaleOut(pos, 0.5);
    d.scaled.add(pos.id);
  }
}

/** Reconstructs a position's own "1R" from its stored protocol's configured stop%, since the original distance isn't persisted separately. */
function riskPointsFor(pos: Position, cfg: EngineConfig): number | null {
  if (!pos.protocol || pos.protocol === "DELTA") return null; // no live position is ever opened under Delta
  return pos.avg_price * cfg.stopPctByProtocol[pos.protocol];
}

/** Breakeven-then-trail on every open position — see `decideTrail` for the rule itself. */
export async function checkTrailingStop(d: GuardDeps): Promise<void> {
  for (const pos of d.ledger.openPositions) {
    const riskPoints = riskPointsFor(pos, d.cfg);
    if (riskPoints === null || riskPoints <= 0) continue;
    const ltp = d.ltp(pos.token);
    if (ltp <= 0) continue;

    const newStop = decideTrail({
      side: pos.side,
      avgPrice: pos.avg_price,
      stopLoss: pos.stop_loss,
      ltp,
      riskPoints,
    });
    if (newStop === null) continue;

    d.log(
      "INFO",
      `${pos.trading_symbol} trailed — stop moved to ${newStop.toFixed(2)}.`,
      pos.underlying,
    );
    await d.trail(pos, newStop);
  }
}

/**
 * Trails the stop behind the COA wall itself as it migrates favourably
 * intraday — a CE long's Aegis-1 climbing under a rising price, or a PE
 * long's Zenith-1 sinking under a falling one — rather than only the flat
 * R-multiple `checkTrailingStop` already provides.
 *
 * Recomputes the same wall-anchored stop `SignalEngine.evaluate` derives at
 * entry (see its own comment), fresh every tick, against the position's
 * *current* premium (`ltp`) rather than its entry price — so this both
 * captures the wall moving and the option's own price moving. There is
 * deliberately no "has the wall actually moved since entry" check: handing
 * a freshly-computed candidate to `d.trail` every tick is enough, since
 * `Ledger.tightenStop`'s own one-way guarantee already discards anything
 * that isn't a genuine improvement — this needs no separate bookkeeping to
 * avoid moving the stop backwards.
 *
 * Browser-only, same as `checkInvalidation`: both need a live COA chain
 * (`d.chains`), which the server watchdog does not have — see its own
 * module doc in `lib/server/watchdogGuards.ts`.
 */
export async function checkWallTrail(d: GuardDeps): Promise<void> {
  for (const pos of d.ledger.openPositions) {
    if (!pos.option_type) continue;
    const chain = d.chains[pos.underlying];
    if (!chain || chain.spot <= 0) continue;
    const ltp = d.ltp(pos.token);
    if (ltp <= 0) continue;

    const points = wallStopPoints({
      optionType: pos.option_type,
      spot: chain.spot,
      aegis1: chain.levels.aegis_1,
      zenith1: chain.levels.zenith_1,
      invalidationPct: effectiveConfig(pos.underlying, d.cfg).invalidationPct,
      itmDeltaApprox: d.cfg.itmDeltaApprox,
    });
    if (points === null) continue;

    const candidate = Number((pos.side === "BUY" ? ltp - points : ltp + points).toFixed(2));
    const improves =
      pos.side === "BUY"
        ? pos.stop_loss === null || candidate > pos.stop_loss
        : pos.stop_loss === null || candidate < pos.stop_loss;
    if (!improves) continue;

    d.log(
      "INFO",
      `${pos.trading_symbol} wall-trailed — stop moved to ${candidate.toFixed(2)} tracking ${pos.option_type === "CE" ? "Aegis-1" : "Zenith-1"}.`,
      pos.underlying,
    );
    await d.trail(pos, candidate);
  }
}

/** 3:15 PM IST — flatten everything ahead of the 3:40 PM close. */
export async function checkDaylightRest(d: GuardDeps): Promise<void> {
  if (d.daylightRestDone) return;
  if (secondsToDaylightRest() > 0) return;

  if (isWeekend() || istMinutes() > MARKET_CLOSE_MIN) {
    d.onDaylightRestDone();
    return;
  }

  const open = d.ledger.openPositions;
  if (open.length) {
    d.log("DAYLIGHT_REST", "3:15 PM IST Daylight Rest Protocol — flattening 100% of open positions.");
    for (const pos of open) await d.exit(pos, "DAYLIGHT_REST");
  }
  d.onDaylightRestDone();
}

export async function runGuards(d: GuardDeps): Promise<void> {
  await checkStops(d);
  await checkInvalidation(d);
  await checkThesisBroken(d);
  await checkTrailingStop(d);
  await checkWallTrail(d);
  await checkWeakeningRotation(d);
  await checkDaylightRest(d);
}
