import type { OptionChain, Position, RiskEvent, Side } from "@/lib/types";
import type { Ledger } from "./ledger";
import type { RrgEngine } from "./rrg";
import type { EngineConfig } from "./config";
import { isWeekend, istMinutes, MARKET_CLOSE_MIN, secondsToDaylightRest } from "./config";

/**
 * Capital-preservation circuit breakers — port of `backend/app/risk.py`.
 *
 * **Behavioural difference from the Python engine, stated plainly:** these run in
 * the browser on a 1 Hz timer, so they only fire while the tab is open. A server
 * process guarded positions around the clock; this build does not. Do not leave
 * positions open with the terminal closed.
 */

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

/** 0.35 % index break invalidation against the COA 2.0 bounds. */
export async function checkInvalidation(d: GuardDeps): Promise<void> {
  for (const [underlying, chain] of Object.entries(d.chains)) {
    if (!chain || chain.spot <= 0) continue;
    const { levels } = chain;
    const supportBroken = breach(chain.spot, levels.aegis_1, "below", d.cfg.invalidationPct);
    const resistanceBroken = breach(chain.spot, levels.zenith_1, "above", d.cfg.invalidationPct);
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
          `by >${d.cfg.invalidationPct}% — liquidating ${pos.trading_symbol}.`,
        underlying,
      );
      await d.exit(pos, "INVALIDATION");
    }
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
        d.cfg.weakeningMinAdverseMovePct,
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
  await checkTrailingStop(d);
  await checkWeakeningRotation(d);
  await checkDaylightRest(d);
}
