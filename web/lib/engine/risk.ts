import type { OptionChain, Position, RiskEvent } from "@/lib/types";
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

export interface GuardDeps {
  ledger: Ledger;
  chains: Record<string, OptionChain>;
  rrg: Record<string, RrgEngine>;
  cfg: EngineConfig;
  ltp: (token: string) => number;
  exit: ExitFn;
  scaleOut: ScaleFn;
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

/** Automated TP1 scale-out when a held node rotates into Weakening. */
export async function checkWeakeningRotation(d: GuardDeps): Promise<void> {
  for (const pos of d.ledger.openPositions) {
    if (d.scaled.has(pos.id) || pos.lots < 2) continue;
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

    d.log("TARGET", `${pos.trading_symbol} rotated into Weakening — TP1 scale-out.`, pos.underlying);
    await d.scaleOut(pos, 0.5);
    d.scaled.add(pos.id);
  }
}

/** 3:15 PM IST — flatten everything ahead of the 3:30 PM close. */
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
  await checkWeakeningRotation(d);
  await checkDaylightRest(d);
}
