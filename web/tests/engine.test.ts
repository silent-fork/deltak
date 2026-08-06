/**
 * Parity checks for the TypeScript engine.
 *
 * These mirror the Python suite (backend/tests) case-for-case: if the port
 * drifted from the strategy the server implemented, these are what catch it.
 * Run with `npm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateSize,
  legRiskAtStop,
  portfolioRiskAtStop,
  roundToLot,
  resolveLotSize,
} from "../lib/engine/sizing";
import { RrgEngine, classifyQuadrant, MIN_SAMPLES } from "../lib/engine/rrg";
import { ChainBuilder, challengeWall, itmDepth, nearestStrike } from "../lib/engine/coa";
import {
  applyDwellLatch,
  buildupContradicts,
  classifyProtocol,
  emptyDwellState,
  rollingExtremeBreak,
  rollingRangePct,
  SignalEngine,
} from "../lib/engine/dkms";
import { Ledger, applySlippage } from "../lib/engine/ledger";
import {
  NSE_OPTIONS_RATES,
  estimateCharges,
  roundTripCharges,
} from "../lib/engine/charges";
import {
  breach,
  checkStops,
  checkTrailingStop,
  checkWallTrail,
  checkWeakeningRotation,
  decideExit,
  decideScaleIn,
  decideTrail,
  wallStopPoints,
  weakeningCorroborated,
} from "../lib/engine/risk";
import { planTick } from "../lib/engine/loop";
import { decodePacket } from "../lib/stream/smartstream";
import { TickStore, emptyTick } from "../lib/stream/ticks";
import { ScripMaster, type Instrument, type MasterPayload } from "../lib/engine/scripMaster";
import {
  DAYLIGHT_REST_MIN,
  DEFAULT_CONFIG,
  EXCHANGE_BSE_CM,
  EXCHANGE_BSE_FO,
  EXCHANGE_NSE_CM,
  EXCHANGE_NSE_FO,
  INDEX_UNIVERSE,
  MARKET_OPEN_MIN,
  effectiveConfig,
  nextMidnightIst,
  secondsToDaylightRest,
  secondsToNextOpen,
} from "../lib/engine/config";
import type { CoaLevels, OptionChain, Position } from "../lib/types";
import { withRetry } from "../lib/retry";

/* ------------------------------------------------------------------ sizing */

test("sizing formula matches the specification", () => {
  // floor(500000 * 1% / (10 * 75)) = floor(5000 / 750) = 6
  const r = calculateSize({
    underlying: "NIFTY", stopLossPoints: 10, capital: 500_000, riskPct: 1, lotSize: 75,
  });
  assert.equal(r.lots, 6);
  assert.equal(r.quantity, 450);
  assert.equal(r.risk_amount, 5000);
  assert.equal(r.risk_per_lot, 750);
});

test("capital cap applies when premium is expensive", () => {
  const r = calculateSize({
    underlying: "NIFTY", stopLossPoints: 1, capital: 100_000, riskPct: 1,
    lotSize: 75, entryPrice: 400,
  });
  assert.equal(r.capped_by, "CAPITAL");
  assert.equal(r.lots, 3); // floor(100000 / (400*75))
  assert.ok(r.entry_cost <= 100_000);
});

test("zero lots when the risk budget is too small", () => {
  const r = calculateSize({
    underlying: "NIFTY", stopLossPoints: 500, capital: 10_000, riskPct: 1, lotSize: 75,
  });
  assert.equal(r.lots, 0);
  assert.equal(r.capped_by, "RISK_BUDGET");
});

test("invalid stop is rejected and lot helpers behave", () => {
  assert.equal(
    calculateSize({ underlying: "NIFTY", stopLossPoints: 0, capital: 1e6, riskPct: 1 }).capped_by,
    "INVALID_STOP",
  );
  assert.equal(roundToLot(163, 75), 150);
  assert.equal(resolveLotSize("FINNIFTY"), 40);
  assert.equal(resolveLotSize("BANKNIFTY"), 15);
});

test("single_lot_constrained is set only when the capital clamp is what actually knocked lots down to 1", () => {
  // Risk math alone wants floor(100000*5% / (10*75)) = 6 lots; capital only
  // affords floor(100000 / (400*75)) = 3 — clamped, but not to exactly 1.
  const notSingleLot = calculateSize({
    underlying: "NIFTY", stopLossPoints: 10, capital: 100_000, riskPct: 5,
    lotSize: 75, entryPrice: 400,
  });
  assert.ok(notSingleLot.lots > 1);
  assert.equal(notSingleLot.single_lot_constrained, false);

  // Same risk math, but capital only affords exactly 1 lot.
  const single = calculateSize({
    underlying: "NIFTY", stopLossPoints: 10, capital: 100_000, riskPct: 5,
    lotSize: 75, entryPrice: 1_300,
  });
  assert.equal(single.lots, 1);
  assert.equal(single.capped_by, "CAPITAL");
  assert.equal(single.single_lot_constrained, true);

  // The risk math itself only ever wanted 1 lot — floor(50000*10% / (50*75))
  // = 1 — no clamp involved (no entryPrice given, so affordability never
  // runs), so this is not "constrained", just how the trade always sized.
  const naturallyOne = calculateSize({
    underlying: "NIFTY", stopLossPoints: 50, capital: 50_000, riskPct: 10, lotSize: 75,
  });
  assert.equal(naturallyOne.lots, 1);
  assert.equal(naturallyOne.capped_by, null);
  assert.equal(naturallyOne.single_lot_constrained, false);
});

/* ---------------------------------------------------------- index universe */

test("FINNIFTY's spot aliases cover more than one real naming variant", () => {
  // The single-alias guess this shipped with ("nifty fin service") is exactly
  // the kind of brittle match that silently breaks a spot trace — this
  // pins the widened list so a future edit can't quietly narrow it back down.
  const aliases = INDEX_UNIVERSE.FINNIFTY.spotAliases;
  assert.ok(aliases.includes("finnifty"));
  assert.ok(aliases.length >= 3);
});

test("every configured index declares which exchange it actually trades on", () => {
  assert.equal(INDEX_UNIVERSE.NIFTY.exchange, "NSE");
  assert.equal(INDEX_UNIVERSE.BANKNIFTY.exchange, "NSE");
  assert.equal(INDEX_UNIVERSE.FINNIFTY.exchange, "NSE");
  assert.equal(INDEX_UNIVERSE.BANKEX.exchange, "BSE");
  assert.equal(INDEX_UNIVERSE.SENSEX.exchange, "BSE");
});

test("BANKEX and SENSEX carry real, independently-confirmed spot tokens and contract specs", () => {
  // Confirmed 2026-08-03 directly against a live scrip-master fetch (see
  // config.ts's comment on the INDEX_UNIVERSE entries) — not guesses, unlike
  // the first version of this feature which shipped with these unset.
  assert.equal(INDEX_UNIVERSE.BANKEX.spotTokenFallback, "99919012");
  assert.equal(INDEX_UNIVERSE.SENSEX.spotTokenFallback, "99919000");
  assert.equal(INDEX_UNIVERSE.BANKEX.strikeStep, 100);
  assert.equal(INDEX_UNIVERSE.SENSEX.strikeStep, 100);
  assert.equal(INDEX_UNIVERSE.BANKEX.lotSize, 30);
  assert.equal(INDEX_UNIVERSE.SENSEX.lotSize, 20);
});

test("subscriptionTokens splits NSE and BSE indices into separate buckets", () => {
  const payload: MasterPayload = {
    generatedAt: new Date().toISOString(),
    totalRecords: 2,
    spots: {
      NIFTY: {
        token: "99926000", symbol: "NIFTY", name: "NIFTY", exchSeg: "NSE",
        strike: 0, lotSize: 1, expiry: null, optionType: null,
      },
      SENSEX: {
        token: "99919000", symbol: "SENSEX", name: "SENSEX", exchSeg: "BSE",
        strike: 0, lotSize: 1, expiry: null, optionType: null,
      },
    },
    options: {
      NIFTY: [
        { token: "1", symbol: "NIFTY24500CE", name: "NIFTY", exchSeg: "NFO",
          strike: 24_500, lotSize: 75, expiry: EXPIRY, optionType: "CE" },
      ],
      SENSEX: [
        { token: "2", symbol: "SENSEX80000CE", name: "SENSEX", exchSeg: "BFO",
          strike: 80_000, lotSize: 20, expiry: EXPIRY, optionType: "CE" },
      ],
    },
  };
  const master = new ScripMaster(payload);
  const { nse, bse } = master.subscriptionTokens(
    { NIFTY: 24_500, SENSEX: 80_000 },
    12,
  );
  assert.ok(nse.spotTokens.includes("99926000"));
  assert.ok(nse.optionTokens.includes("1"));
  assert.ok(!nse.spotTokens.includes("99919000"));

  assert.ok(bse.spotTokens.includes("99919000"));
  assert.ok(bse.optionTokens.includes("2"));
  assert.ok(!bse.spotTokens.includes("99926000"));
});

test("SmartStream exchange type codes are the four documented segments, all distinct", () => {
  const codes = new Set([EXCHANGE_NSE_CM, EXCHANGE_NSE_FO, EXCHANGE_BSE_CM, EXCHANGE_BSE_FO]);
  assert.equal(codes.size, 4);
});

test("the single-position concentration cap can bind tighter than capital affordability", () => {
  // Risk-derived: floor(500000*30% / (15*75)) = floor(150000/1125) = 133 lots,
  // costing 133*60*75 = 598,500 — capital alone would only trim this to 111
  // lots. The 10%-of-equity concentration ceiling is meant to bind first.
  const r = calculateSize({
    underlying: "NIFTY", stopLossPoints: 15, capital: 500_000, riskPct: 30,
    lotSize: 75, entryPrice: 60, maxPositionCapitalPct: 10,
  });
  assert.equal(r.capped_by, "CONCENTRATION");
  assert.equal(r.lots, 11); // floor(50,000 / (60*75))
  assert.ok(r.entry_cost <= 50_000);
});

test("no concentration cap given leaves capital affordability as the only clamp", () => {
  const r = calculateSize({
    underlying: "NIFTY", stopLossPoints: 1, capital: 100_000, riskPct: 1,
    lotSize: 75, entryPrice: 400,
  });
  assert.equal(r.capped_by, "CAPITAL");
});

test("portfolio risk sums each leg's own loss-at-stop", () => {
  const long = { side: "BUY" as const, avg_price: 165, stop_loss: 123.75, quantity: 150 };
  const short = { side: "SELL" as const, avg_price: 100, stop_loss: 120, quantity: 75 };
  assert.equal(legRiskAtStop(long), 6187.5); // (165-123.75)*150
  assert.equal(legRiskAtStop(short), 1500); // a short's risk runs the other way: (120-100)*75
  assert.equal(legRiskAtStop({ ...long, stop_loss: null }), 0);
  assert.equal(portfolioRiskAtStop([long, short]), 6187.5 + 1500);
});

/* --------------------------------------------------------------------- RRG */

test("quadrant matrix", () => {
  assert.equal(classifyQuadrant(101, 101), "LEADING");
  assert.equal(classifyQuadrant(99, 101), "IMPROVING");
  assert.equal(classifyQuadrant(101, 99), "WEAKENING");
  assert.equal(classifyQuadrant(99, 99), "LAGGING");
  assert.equal(classifyQuadrant(100, 100), "LEADING");
});

test("flat series sits at the origin", () => {
  const e = new RrgEngine(20, 3);
  let p = { rs_ratio: 0, rs_momentum: 0 };
  for (let i = 0; i < 30; i++) p = e.update("T1", 100, 20_000);
  assert.equal(p.rs_ratio, 100);
  assert.equal(p.rs_momentum, 100);
});

test("outperformance rotates into Leading, decay into Lagging", () => {
  const up = new RrgEngine(20, 3);
  let price = 100;
  for (let i = 0; i < 40; i++) { price *= 1.01; up.update("T1", price, 20_000); }
  assert.equal(up.quadrant("T1"), "LEADING");

  const down = new RrgEngine(20, 3);
  price = 100;
  for (let i = 0; i < 40; i++) { price *= 0.99; down.update("T1", price, 20_000); }
  assert.equal(down.quadrant("T1"), "LAGGING");
});

test("nodes are damped until matured and tails stay bounded", () => {
  const e = new RrgEngine(10, 2, 5);
  let price = 100;
  for (let i = 1; i < MIN_SAMPLES; i++) { price *= 1.05; e.update("T1", price, 20_000); assert.ok(!e.matured("T1")); }
  e.update("T1", price * 1.05, 20_000);
  assert.ok(e.matured("T1"));
  for (let i = 0; i < 20; i++) e.update("T1", 100 + i, 20_000);
  assert.equal(e.tail("T1").length, 5);
});

test("zero inputs never throw", () => {
  assert.equal(new RrgEngine().update("T1", 0, 0).rs_ratio, 100);
});

test("a stale, repeated print does not advance maturity", () => {
  const e = new RrgEngine(10, 2, 5);
  // The 1 Hz loop advances every node whenever anything in the whole tick
  // universe printed, not only when this contract itself did — an untraded
  // strike's price is simply carried forward call after call.
  for (let i = 0; i < 10; i++) e.update("T1", 100, 20_000);
  assert.ok(!e.matured("T1"));
  // One genuine change earns exactly one sample, not a jump to matured.
  e.update("T1", 101, 20_000);
  assert.ok(!e.matured("T1"));
});

test("a custom minSamples matures a thinly-traded node sooner", () => {
  const e = new RrgEngine(10, 2, 5, 4);
  let price = 100;
  for (let i = 1; i < 4; i++) { price *= 1.05; e.update("T1", price, 20_000); assert.ok(!e.matured("T1")); }
  e.update("T1", price * 1.05, 20_000);
  assert.ok(e.matured("T1"));
});

test("FINNIFTY declares a lower RRG maturity threshold than NIFTY/BANKNIFTY", () => {
  assert.ok((INDEX_UNIVERSE.FINNIFTY.rrgMinSamples ?? MIN_SAMPLES) < MIN_SAMPLES);
  assert.equal(INDEX_UNIVERSE.NIFTY.rrgMinSamples, undefined);
  assert.equal(INDEX_UNIVERSE.BANKNIFTY.rrgMinSamples, undefined);
});

test("FINNIFTY declares a wider RRG window and momentum lookback than the shared default", () => {
  assert.ok(INDEX_UNIVERSE.FINNIFTY.rrgWindow! > DEFAULT_CONFIG.rrgWindow);
  assert.ok(INDEX_UNIVERSE.FINNIFTY.rrgMomentumLookback! > DEFAULT_CONFIG.rrgMomentumLookback);
  assert.equal(INDEX_UNIVERSE.NIFTY.rrgWindow, undefined);
  assert.equal(INDEX_UNIVERSE.NIFTY.rrgMomentumLookback, undefined);
  assert.equal(INDEX_UNIVERSE.BANKNIFTY.rrgWindow, undefined);
  assert.equal(INDEX_UNIVERSE.BANKNIFTY.rrgMomentumLookback, undefined);
});

test("FINNIFTY declares a lower RRG ready-fraction so the plot clears sooner on a thin book", () => {
  assert.ok(INDEX_UNIVERSE.FINNIFTY.rrgReadyFraction! < 0.9);
  assert.equal(INDEX_UNIVERSE.NIFTY.rrgReadyFraction, undefined);
  assert.equal(INDEX_UNIVERSE.BANKNIFTY.rrgReadyFraction, undefined);
});

/* --------------------------------------------------------------------- COA */

test("itm depth and nearest strike", () => {
  assert.equal(nearestStrike(24_512, [24_450, 24_500, 24_550]), 24_500);
  assert.equal(itmDepth(24_400, 24_500, "CE", 50), 2);
  assert.equal(itmDepth(24_600, 24_500, "PE", 50), 2);
  assert.equal(itmDepth(24_600, 24_500, "CE", 50), -2);
  assert.equal(itmDepth(24_500, 24_500, "CE", 50), 0);
});

const EXPIRY = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

function makeMaster(spot = 24_500, step = 50, depth = 20, lotSize = 75): ScripMaster {
  const options: Instrument[] = [];
  let token = 1000;
  const base = Math.round(spot / step) * step;
  for (let i = -depth; i <= depth; i++) {
    const strike = base + i * step;
    for (const optionType of ["CE", "PE"] as const) {
      token += 1;
      options.push({
        token: String(token),
        symbol: `NIFTY${strike}${optionType}`,
        name: "NIFTY",
        exchSeg: "NFO",
        strike, lotSize, expiry: EXPIRY, optionType,
      });
    }
  }
  const payload: MasterPayload = {
    generatedAt: new Date().toISOString(),
    totalRecords: options.length,
    spots: {
      NIFTY: { token: "99926000", symbol: "NIFTY", name: "NIFTY", exchSeg: "NSE",
               strike: 0, lotSize: 1, expiry: null, optionType: null },
    },
    options: { NIFTY: options },
  };
  return new ScripMaster(payload);
}

function fillTicks(
  master: ScripMaster, store: TickStore, spot = 24_500,
  oiProfile: Record<string, number> = {},
): TickStore {
  const s = emptyTick(master.spotToken("NIFTY"));
  s.ltp = spot; s.close = spot;
  store.apply(s);
  for (const inst of master.contracts("NIFTY")) {
    const intrinsic = inst.optionType === "CE"
      ? Math.max(0, spot - inst.strike) : Math.max(0, inst.strike - spot);
    const px = Number((intrinsic + 60).toFixed(2));
    const t = emptyTick(inst.token);
    t.ltp = px; t.close = px; t.volume = 1000;
    t.oi = oiProfile[`${inst.strike}${inst.optionType}`] ?? 10_000;
    t.bestBid = Number((px * 0.99).toFixed(2));
    t.bestAsk = Number((px * 1.01).toFixed(2));
    store.apply(t);
  }
  return store;
}

test("chain shape, moneyness and the Quantum Horizon", () => {
  const master = makeMaster();
  const ticks = fillTicks(master, new TickStore());
  const chain = new ChainBuilder("NIFTY", new RrgEngine(), DEFAULT_CONFIG)
    .build(master, ticks, 24_500);

  assert.equal(chain.atm_strike, 24_500);
  assert.equal(chain.rows.filter((r) => r.quantum_horizon).length, 1);
  const deep = chain.rows.find((r) => r.strike === 24_400)!;
  assert.equal(deep.call!.moneyness, "ITM");
  assert.equal(deep.call!.itm_depth, 2);
  assert.equal(deep.put!.moneyness, "OTM");
  assert.ok(chain.pcr > 0);
});

test("COA levels track the OI walls", () => {
  const master = makeMaster();
  const ticks = fillTicks(master, new TickStore(), 24_500, {
    "24300PE": 900_000, "24800CE": 850_000,
  });
  const chain = new ChainBuilder("NIFTY", new RrgEngine(), DEFAULT_CONFIG)
    .build(master, ticks, 24_500);
  assert.equal(chain.levels.aegis_0, 24_300);
  assert.equal(chain.levels.zenith_0, 24_800);
  // With no intraday delta yet, COA 2.0 falls back to the COA 1.0 walls.
  assert.equal(chain.levels.aegis_1, 24_300);
  assert.equal(chain.levels.zenith_1, 24_800);
});

test("COA 2.0 follows intraday OI change", () => {
  const master = makeMaster();
  const ticks = fillTicks(master, new TickStore());
  const builder = new ChainBuilder("NIFTY", new RrgEngine(), DEFAULT_CONFIG);
  builder.build(master, ticks, 24_500); // establishes session-open OI

  const put = master.find("NIFTY", 24_350, "PE")!;
  const call = master.find("NIFTY", 24_700, "CE")!;
  for (const [inst, oi] of [[put, 400_000], [call, 380_000]] as const) {
    const t = emptyTick(inst.token); t.ltp = 50; t.oi = oi; ticks.apply(t);
  }
  const chain = builder.build(master, ticks, 24_500);
  assert.equal(chain.levels.aegis_1, 24_350);
  assert.equal(chain.levels.zenith_1, 24_700);
});

test("wall shift looks at a recent window, not the whole trail", () => {
  const master = makeMaster();
  const ticks = fillTicks(master, new TickStore(), 24_500, {
    "24300PE": 900_000, "24800CE": 850_000,
  });
  const cfg = { ...DEFAULT_CONFIG, shiftLookback: 5 };
  const builder = new ChainBuilder("NIFTY", new RrgEngine(), cfg);

  // First build: COA 2.0 has no delta yet, so aegis_1 falls back to the COA
  // 1.0 wall at 24_300 — a noisy early print sits at the front of the trail.
  const first = builder.build(master, ticks, 24_500);
  assert.equal(first.levels.aegis_1, 24_300);

  // Writers then move fresh intraday OI onto 24_450 and hold it there for
  // longer than the lookback — long enough to roll the 24_300 print out of a
  // 5-sample recent window, even though it is still inside the full trail.
  const put = master.find("NIFTY", 24_450, "PE")!;
  let chain = first;
  for (let i = 0; i < 8; i++) {
    const t = emptyTick(put.token); t.ltp = 60; t.oi = 400_000 + i; ticks.apply(t);
    chain = builder.build(master, ticks, 24_500);
  }
  assert.equal(chain.levels.aegis_1, 24_450);
  // A first-vs-last comparison over the whole trail would still read the
  // 3-strike jump from the stale 24_300 print; the recent window reads a wall
  // that has held for longer than it as settled.
  assert.equal(chain.levels.aegis_shift, 0);
});

/* ------------------------------------------------------ Phase 2: wall hysteresis */

test("challengeWall: a challenger must beat the incumbent's own oi_change by the margin, not just edge it out", () => {
  // No incumbent yet — the best candidate wins outright, no contest.
  assert.equal(challengeWall(null, [{ strike: 100, oiChange: 5_000 }], 15), 100);
  assert.equal(
    challengeWall(null, [{ strike: 100, oiChange: 5_000 }, { strike: 150, oiChange: 9_000 }], 15),
    150,
  );

  // No candidates at all — incumbent (even a null one) is untouched.
  assert.equal(challengeWall(100, [], 15), 100);
  assert.equal(challengeWall(null, [], 15), null);

  // The incumbent's own strike is still the best candidate — no margin math needed.
  assert.equal(
    challengeWall(100, [{ strike: 100, oiChange: 5_000 }, { strike: 150, oiChange: 5_200 }], 15),
    100,
  );

  // A near-tie challenger (under the 15% margin) does not flip the wall.
  assert.equal(
    challengeWall(100, [{ strike: 100, oiChange: 5_000 }, { strike: 150, oiChange: 5_700 }], 15), // +14%
    100,
  );
  // Clearing the margin does.
  assert.equal(
    challengeWall(100, [{ strike: 100, oiChange: 5_000 }, { strike: 150, oiChange: 5_800 }], 15), // +16%
    150,
  );

  // The incumbent strike has since dropped out of the candidate list
  // entirely (rolled below the floor elsewhere, or out of the window) —
  // treated as zero, so any real candidate beats it.
  assert.equal(challengeWall(100, [{ strike: 150, oiChange: 1 }], 15), 150);
});

test("a near-tie OI challenger does not flip the wall; a real one does", () => {
  const master = makeMaster();
  const ticks = fillTicks(master, new TickStore(), 24_500, { "24300PE": 10_000 });
  const cfg = { ...DEFAULT_CONFIG, wallChallengeMarginPct: 15, earlyOiChangeFloor: 100 };
  const builder = new ChainBuilder("NIFTY", new RrgEngine(), cfg);

  // First build establishes the session-open baseline (no delta yet).
  builder.build(master, ticks, 24_500);

  // 24,300 becomes the real, challenge-margin-cleared incumbent wall.
  const incumbent = master.find("NIFTY", 24_300, "PE")!;
  let t = emptyTick(incumbent.token); t.ltp = 60; t.oi = 10_000 + 5_000; ticks.apply(t);
  let chain = builder.build(master, ticks, 24_500);
  assert.equal(chain.levels.aegis_1, 24_300);

  // A neighbour's oi_change edges ahead by only 10% — not enough to take over.
  const challenger = master.find("NIFTY", 24_350, "PE")!;
  t = emptyTick(challenger.token); t.ltp = 55; t.oi = 10_000 + 5_500; ticks.apply(t);
  chain = builder.build(master, ticks, 24_500);
  assert.equal(chain.levels.aegis_1, 24_300);

  // The same neighbour keeps accumulating until it clears the margin —
  // now it genuinely takes over.
  t = emptyTick(challenger.token); t.ltp = 55; t.oi = 10_000 + 6_000; ticks.apply(t);
  chain = builder.build(master, ticks, 24_500);
  assert.equal(chain.levels.aegis_1, 24_350);
});

test("oi_change below the floor is not a real candidate — falls back the same way as no delta at all", () => {
  const master = makeMaster();
  const ticks = fillTicks(master, new TickStore(), 24_500, { "24300PE": 900_000 });
  const cfg = { ...DEFAULT_CONFIG, earlyOiChangeFloor: 5_000 };
  const builder = new ChainBuilder("NIFTY", new RrgEngine(), cfg);
  builder.build(master, ticks, 24_500); // COA 1.0 wall at 24_300 from raw OI

  // A tiny, session-open-noise-scale oi_change on a neighbouring strike —
  // well under the floor — must not be picked up as a COA 2.0 candidate.
  // (24_450's own baseline is the fillTicks default of 10_000, not 24_300's 900_000.)
  const inst = master.find("NIFTY", 24_450, "PE")!;
  const t = emptyTick(inst.token); t.ltp = 60; t.oi = 10_000 + 200; ticks.apply(t);
  const chain = builder.build(master, ticks, 24_500);
  assert.equal(chain.levels.aegis_1, 24_300); // still the COA 1.0 fallback
});

test("effectiveConfig: per-index overrides layer on the shared base; portfolio knobs never vary by index", () => {
  const nifty = effectiveConfig("NIFTY", DEFAULT_CONFIG);
  assert.deepEqual(nifty, DEFAULT_CONFIG); // no overrides at all — the tuned baseline

  const bankNifty = effectiveConfig("BANKNIFTY", DEFAULT_CONFIG);
  assert.equal(bankNifty.invalidationPct, INDEX_UNIVERSE.BANKNIFTY.invalidationPct);
  assert.ok(bankNifty.invalidationPct > DEFAULT_CONFIG.invalidationPct);
  // Portfolio/capital-management fields stay identical across every index —
  // only the noise-vs-signal surface varies.
  assert.equal(bankNifty.riskPct, DEFAULT_CONFIG.riskPct);
  assert.equal(bankNifty.maxPortfolioRiskPct, DEFAULT_CONFIG.maxPortfolioRiskPct);
  assert.equal(bankNifty.stopPctByProtocol.ALPHA, DEFAULT_CONFIG.stopPctByProtocol.ALPHA);

  // An underlying with no IndexSpec entry at all falls back to the base config untouched.
  assert.deepEqual(effectiveConfig("NOT_A_REAL_INDEX", DEFAULT_CONFIG), DEFAULT_CONFIG);
});

test("selectItm honours depth and direction", () => {
  const master = makeMaster();
  const b = new ChainBuilder("NIFTY", new RrgEngine(), DEFAULT_CONFIG);
  assert.equal(b.selectItm(master, "CE", 24_500, 2)!.strike, 24_400);
  assert.equal(b.selectItm(master, "PE", 24_500, 3)!.strike, 24_650);
});

/* -------------------------------------------------------------------- DKMS */

const levels = (a = 24_300, z = 24_800, as = 0, zs = 0): CoaLevels => ({
  aegis_0: a, zenith_0: z, aegis_1: a, zenith_1: z, aegis_shift: as, zenith_shift: zs,
  aegis_trail: [], zenith_trail: [],
});

test("protocol classification", () => {
  const tol = DEFAULT_CONFIG.levelShiftTolerance;
  assert.equal(classifyProtocol(levels(), tol), "ALPHA");
  assert.equal(classifyProtocol(levels(24_300, 24_800, 0, 3), tol), "BETA");
  assert.equal(classifyProtocol(levels(24_300, 24_800, -3, 0), tol), "GAMMA");
  assert.equal(classifyProtocol(levels(24_300, 24_800, -3, 3), tol), "DELTA");
  assert.equal(
    classifyProtocol({ aegis_0: null, zenith_0: null, aegis_1: null, zenith_1: null,
                       aegis_shift: 0, zenith_shift: 0,
                       aegis_trail: [], zenith_trail: [] }, tol),
    "DELTA",
  );
});

function warmEngine(spot: number, oiProfile: Record<string, number> = {}) {
  const master = makeMaster();
  const ticks = fillTicks(master, new TickStore(), spot, oiProfile);
  const rrg = new RrgEngine();
  const builder = new ChainBuilder("NIFTY", rrg, DEFAULT_CONFIG);
  for (let i = 0; i < 12; i++) builder.build(master, ticks, spot);
  return { master, ticks, builder, engine: new SignalEngine("NIFTY", builder, DEFAULT_CONFIG) };
}

const WALLS = { "24300PE": 900_000, "24800CE": 850_000 };

test("Alpha at support buys an ITM call under the Zero-OTM rule", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.equal(sig.protocol, "ALPHA");
  assert.equal(sig.option_type, "CE");
  assert.ok(sig.itm_depth! >= 2);
  assert.ok(sig.strike! < chain.spot);
  assert.ok(sig.sizing!.lots >= 1);
});

test("a closed market blocks the signal even when the setup otherwise qualifies", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  // Same chain that produces an actionable Alpha buy above — only `trading`
  // differs, and that alone must suppress it.
  const sig = engine.evaluate(chain, master, 1_000_000, undefined, { trading: false });
  assert.equal(sig.actionable, false);
  assert.equal(sig.blocked_reason, "MARKET_CLOSED");
  assert.equal(sig.token, null);
  assert.equal(sig.entry_price, null);
});

test("trading defaults to true when the caller omits it", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.notEqual(sig.blocked_reason, "MARKET_CLOSED");
});

test("Alpha mid-range is blocked", () => {
  const { master, ticks, builder, engine } = warmEngine(24_550, WALLS);
  const chain = builder.build(master, ticks, 24_550);
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.equal(sig.actionable, false);
  assert.equal(sig.blocked_reason, "MID_RANGE");
});

test("Delta regime mutes the auto-driver", () => {
  const { master, ticks, builder, engine } = warmEngine(24_500);
  const chain = builder.build(master, ticks, 24_500);
  chain.levels.aegis_shift = -4;
  chain.levels.zenith_shift = 4;
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.equal(sig.protocol, "DELTA");
  assert.equal(sig.blocked_reason, "VOLATILITY_TRAP");
});

test("Gamma selects an ITM put", () => {
  const { master, ticks, builder, engine } = warmEngine(24_500);
  // Gamma's micro-rally check (rollingExtremeBreak) needs a real rolling
  // low to break from — warm the engine's own spot window with a rising
  // sequence before the call this test actually inspects.
  for (const s of [24_400, 24_430, 24_460]) {
    engine.evaluate(builder.build(master, ticks, s), master, 1_000_000);
  }
  const chain = builder.build(master, ticks, 24_500);
  chain.levels.aegis_shift = -3;
  chain.levels.zenith_shift = 0;
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.equal(sig.protocol, "GAMMA");
  assert.equal(sig.option_type, "PE");
  assert.ok(sig.strike! > chain.spot);
});

/* ---------------------------------------------------- Phase 1: noise reduction */

test("rollingExtremeBreak: needs a real retracement from the rolling extreme, not just the last sample", () => {
  // Fewer than 2 samples — nothing to break from, fails closed rather than
  // needing a separate bootstrap case.
  assert.equal(rollingExtremeBreak([], "dip", 0.05), false);
  assert.equal(rollingExtremeBreak([24_500], "dip", 0.05), false);

  // A dip: high of 24,500, min 0.05% retracement is 12.25 points.
  assert.equal(rollingExtremeBreak([24_400, 24_460, 24_500, 24_487], "dip", 0.05), true); // 13pt off the high
  assert.equal(rollingExtremeBreak([24_400, 24_460, 24_500, 24_495], "dip", 0.05), false); // only 5pt — not a real dip
  // The old bug this replaces: a flat last tick used to count as "dipping"
  // (`spot <= prevSpot` with `<=`). It no longer does.
  assert.equal(rollingExtremeBreak([24_500, 24_500], "dip", 0.05), false);

  // A rally: mirrors the dip case off the rolling low.
  assert.equal(rollingExtremeBreak([24_600, 24_540, 24_500, 24_513], "rally", 0.05), true); // 13pt off the low
  assert.equal(rollingExtremeBreak([24_600, 24_540, 24_500, 24_505], "rally", 0.05), false); // only 5pt
});

test("applyDwellLatch: arms after N consecutive qualifying ticks, tolerates M misses once armed, resets on a setup change", () => {
  const dwellTicks = 3;
  const latchTicks = 2;
  let s = emptyDwellState();

  // Ticks 1-2 of the same setup: not yet armed.
  let r = applyDwellLatch(s, true, "ALPHA:CE:1001", dwellTicks, latchTicks);
  assert.equal(r.actionable, false);
  assert.equal(r.state.dwellTicks, 1);
  s = r.state;

  r = applyDwellLatch(s, true, "ALPHA:CE:1001", dwellTicks, latchTicks);
  assert.equal(r.actionable, false);
  assert.equal(r.state.dwellTicks, 2);
  s = r.state;

  // 3rd consecutive qualifying tick — armed.
  r = applyDwellLatch(s, true, "ALPHA:CE:1001", dwellTicks, latchTicks);
  assert.equal(r.actionable, true);
  assert.equal(r.state.armed, true);
  s = r.state;

  // Raw condition drops for up to latchTicks ticks — stays actionable.
  r = applyDwellLatch(s, false, null, dwellTicks, latchTicks);
  assert.equal(r.actionable, true);
  s = r.state;
  r = applyDwellLatch(s, false, null, dwellTicks, latchTicks);
  assert.equal(r.actionable, true);
  s = r.state;

  // A third consecutive miss exhausts the latch — disarms, full reset.
  r = applyDwellLatch(s, false, null, dwellTicks, latchTicks);
  assert.equal(r.actionable, false);
  assert.equal(r.state.dwellTicks, 0);
  s = r.state;

  // Re-qualifying afterwards starts dwell over from 1, not from where it left off.
  r = applyDwellLatch(s, true, "ALPHA:CE:1001", dwellTicks, latchTicks);
  assert.equal(r.actionable, false);
  assert.equal(r.state.dwellTicks, 1);
});

test("applyDwellLatch: a different setup qualifying resets dwell rather than inheriting progress", () => {
  const dwellTicks = 3;
  let s = emptyDwellState();
  let r = applyDwellLatch(s, true, "ALPHA:CE:1001", dwellTicks, 2);
  s = r.state;
  r = applyDwellLatch(s, true, "ALPHA:CE:1001", dwellTicks, 2);
  assert.equal(r.state.dwellTicks, 2);
  s = r.state;

  // Protocol/side/instrument changed underneath — a new setup, not a
  // continuation of the old one's dwell count.
  r = applyDwellLatch(s, true, "BETA:CE:1002", dwellTicks, 2);
  assert.equal(r.actionable, false);
  assert.equal(r.state.dwellTicks, 1);
});

test("Beta's old single-tick dip trigger no longer arms the entry — a real retracement is required", () => {
  const { master, ticks, builder, engine } = warmEngine(24_500);
  // Two flat/rising ticks, then one tick barely lower than the last —
  // exactly the pattern the old `spot <= prevSpot` comparison would have
  // called a "dip." Rolling-window retracement from the high (24,520)
  // rejects it: only ~4 points off the high, well under the 0.05% (~12pt) floor.
  for (const s of [24_500, 24_520]) {
    engine.evaluate(builder.build(master, ticks, s), master, 1_000_000);
  }
  const c = builder.build(master, ticks, 24_516);
  c.levels.aegis_shift = 0;
  c.levels.zenith_shift = 3;
  const sig = engine.evaluate(c, master, 1_000_000);
  assert.equal(sig.protocol, "BETA");
  assert.equal(sig.blocked_reason, "AWAIT_DIP");
  assert.equal(sig.option_type, null);
});

// RRG never matures in these synthetic fixtures (the same option token's
// `ltp` never actually changes between calls, so it never earns a real
// `samples` increment — see `RrgEngine.update`'s own comment), which
// leaves `rs_momentum` sitting right at its damped, noise-sensitive
// starting point near 100 — exactly the knife-edge this session's own
// research flagged as unreliable. Forcing every row's quadrant to LEADING
// isolates this test from that, the same way other tests already override
// `chain.levels` directly rather than depend on delicate OI arithmetic.
function forceLeadingQuadrant(chain: OptionChain): void {
  for (const row of chain.rows) {
    if (row.call) row.call.quadrant = "LEADING";
    if (row.put) row.put.quadrant = "LEADING";
  }
}

test("Beta arms on a genuine micro-dip and Gamma on a genuine micro-rally", () => {
  const beta = warmEngine(24_500);
  for (const s of [24_500, 24_540]) {
    beta.engine.evaluate(beta.builder.build(beta.master, beta.ticks, s), beta.master, 1_000_000);
  }
  // 24,540 high -> 0.05% floor is ~12.3pt; 24,510 is 30pt off the high.
  const betaChain = beta.builder.build(beta.master, beta.ticks, 24_510);
  betaChain.levels.aegis_shift = 0;
  betaChain.levels.zenith_shift = 3;
  forceLeadingQuadrant(betaChain);
  const betaSig = beta.engine.evaluate(betaChain, beta.master, 1_000_000);
  assert.equal(betaSig.protocol, "BETA");
  assert.notEqual(betaSig.blocked_reason, "AWAIT_DIP");
  assert.equal(betaSig.option_type, "CE");

  const gamma = warmEngine(24_500);
  for (const s of [24_500, 24_460]) {
    gamma.engine.evaluate(gamma.builder.build(gamma.master, gamma.ticks, s), gamma.master, 1_000_000);
  }
  const gammaChain = gamma.builder.build(gamma.master, gamma.ticks, 24_490);
  gammaChain.levels.aegis_shift = -3;
  gammaChain.levels.zenith_shift = 0;
  forceLeadingQuadrant(gammaChain);
  const gammaSig = gamma.engine.evaluate(gammaChain, gamma.master, 1_000_000);
  assert.equal(gammaSig.protocol, "GAMMA");
  assert.notEqual(gammaSig.blocked_reason, "AWAIT_RALLY");
  assert.equal(gammaSig.option_type, "PE");
});

/* ---------------------------------------------- Phase 3: execution and regime */

test("rollingRangePct: (max-min)/mean as a percent, 0 with fewer than 2 samples or a non-positive mean", () => {
  assert.equal(rollingRangePct([]), 0);
  assert.equal(rollingRangePct([24_500]), 0);
  assert.equal(rollingRangePct([0, 0]), 0);
  // 40pt range on a ~24,520 mean.
  assert.equal(Number(rollingRangePct([24_500, 24_540, 24_510]).toFixed(3)), 0.163);
});

function widenSpread(chain: OptionChain): void {
  for (const row of chain.rows) {
    for (const leg of [row.call, row.put]) {
      if (!leg || leg.ltp <= 0) continue;
      leg.best_bid = Number((leg.ltp * 0.5).toFixed(2));
      leg.best_ask = Number((leg.ltp * 1.5).toFixed(2));
    }
  }
}

test("a wide bid-ask spread blocks entry even once everything else qualifies", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  widenSpread(chain);
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.equal(sig.actionable, false);
  assert.equal(sig.blocked_reason, "WIDE_SPREAD");
});

test("a tight spread (the fixture default) never trips the spread gate", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.notEqual(sig.blocked_reason, "WIDE_SPREAD");
});

test("a flat tape blocks Beta/Gamma but not Alpha, even at the same realised range", () => {
  // High 24,505 -> low 24,487: an 18pt move is enough to clear the 0.05%
  // dip trigger (~12.3pt) but the window's own range (0.073%) stays under
  // the 0.1% chop floor — armed on the trigger, vetoed on the regime.
  const beta = warmEngine(24_500);
  for (const s of [24_500, 24_505]) {
    beta.engine.evaluate(beta.builder.build(beta.master, beta.ticks, s), beta.master, 1_000_000);
  }
  const betaChain = beta.builder.build(beta.master, beta.ticks, 24_487);
  betaChain.levels.aegis_shift = 0;
  betaChain.levels.zenith_shift = 3;
  forceLeadingQuadrant(betaChain);
  const betaSig = beta.engine.evaluate(betaChain, beta.master, 1_000_000);
  assert.equal(betaSig.protocol, "BETA");
  assert.notEqual(betaSig.blocked_reason, "AWAIT_DIP");
  assert.equal(betaSig.actionable, false);
  assert.equal(betaSig.blocked_reason, "FLAT_TAPE");

  // Alpha, warmed on the same tiny-range spot sequence, is exempt.
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  for (const s of [24_300, 24_303]) {
    engine.evaluate(builder.build(master, ticks, s), master, 1_000_000);
  }
  const chain = builder.build(master, ticks, 24_297);
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.equal(sig.protocol, "ALPHA");
  assert.notEqual(sig.blocked_reason, "FLAT_TAPE");
});

test("the opening quiet window and Daylight Rest both suppress fresh entries when sessionMinute is supplied", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);

  const atOpen = engine.evaluate(chain, master, 1_000_000, undefined, {
    sessionMinute: MARKET_OPEN_MIN,
  });
  assert.equal(atOpen.actionable, false);
  assert.equal(atOpen.blocked_reason, "OPENING_QUIET");

  const pastRest = engine.evaluate(chain, master, 1_000_000, undefined, {
    sessionMinute: DAYLIGHT_REST_MIN,
  });
  assert.equal(pastRest.actionable, false);
  assert.equal(pastRest.blocked_reason, "CLOSING_QUIET");

  const midday = engine.evaluate(chain, master, 1_000_000, undefined, {
    sessionMinute: 12 * 60,
  });
  assert.notEqual(midday.blocked_reason, "OPENING_QUIET");
  assert.notEqual(midday.blocked_reason, "CLOSING_QUIET");
});

test("omitting sessionMinute skips the opening/closing gate entirely, same as every pre-Phase-3 caller", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.notEqual(sig.blocked_reason, "OPENING_QUIET");
  assert.notEqual(sig.blocked_reason, "CLOSING_QUIET");
});

test("a qualifying setup is held for confirmation before it arms, then arms on the Nth consecutive tick", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);

  const first = engine.evaluate(chain, master, 1_000_000);
  assert.equal(first.actionable, false);
  assert.equal(first.blocked_reason, "AWAITING_CONFIRMATION");

  const second = engine.evaluate(chain, master, 1_000_000);
  assert.equal(second.actionable, false);
  assert.equal(second.blocked_reason, "AWAITING_CONFIRMATION");

  const third = engine.evaluate(chain, master, 1_000_000);
  assert.equal(third.actionable, true);
  assert.equal(third.blocked_reason, null);
});

test("Alpha's entry band is narrower than its own invalidation band", () => {
  assert.ok(DEFAULT_CONFIG.alphaEntryBandPct < DEFAULT_CONFIG.invalidationPct);
});

test("signal geometry is internally consistent", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.ok(sig.stop_loss! < sig.entry_price!);
  assert.ok(sig.entry_price! < sig.target_1!);
  assert.ok(sig.target_1! < sig.target_2!);
  assert.equal(Number((sig.entry_price! - sig.stop_loss!).toFixed(2)), sig.stop_loss_points);
});

test("VIX Panic widens the stop and shrinks effective risk%; Calm leaves both unchanged", () => {
  const r2 = (n: number) => Number(n.toFixed(2));

  const baselineEngine = warmEngine(24_300, WALLS);
  const baseline = baselineEngine.engine.evaluate(
    baselineEngine.builder.build(baselineEngine.master, baselineEngine.ticks, 24_300),
    baselineEngine.master,
    1_000_000,
  );

  const calmEngine = warmEngine(24_300, WALLS);
  const calm = calmEngine.engine.evaluate(
    calmEngine.builder.build(calmEngine.master, calmEngine.ticks, 24_300),
    calmEngine.master,
    1_000_000,
    undefined,
    { vixRegime: "Calm" },
  );
  assert.equal(calm.stop_loss_points, baseline.stop_loss_points); // 1x multiplier — no change
  assert.equal(calm.sizing!.risk_pct, baseline.sizing!.risk_pct);

  const panicEngine = warmEngine(24_300, WALLS);
  const panic = panicEngine.engine.evaluate(
    panicEngine.builder.build(panicEngine.master, panicEngine.ticks, 24_300),
    panicEngine.master,
    1_000_000,
    undefined,
    { vixRegime: "Panic" },
  );
  assert.equal(panic.stop_loss_points, r2(baseline.stop_loss_points! * 1.5));
  assert.equal(panic.sizing!.risk_pct, r2(DEFAULT_CONFIG.riskPct * 0.5));
  // A wider stop still leaves a coherent, ordered geometry.
  assert.ok(panic.stop_loss! < panic.entry_price!);
  assert.ok(panic.entry_price! < panic.target_1!);
  assert.ok(panic.target_1! < panic.target_2!);
});

test("buildup contradicts a thesis only when it opposes the direction", () => {
  assert.equal(buildupContradicts("CE", "Short Built Up"), true);
  assert.equal(buildupContradicts("CE", "Long Built Up"), false);
  assert.equal(buildupContradicts("CE", "Short Covering"), false);
  assert.equal(buildupContradicts("PE", "Long Built Up"), true);
  assert.equal(buildupContradicts("PE", "Long Unwinding"), false);
  assert.equal(buildupContradicts("CE", null), false);
});

test("a signal is held when window PCR diverges too far from the cumulative reading", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  assert.ok(chain.pcr > 0);
  const sig = engine.evaluate(chain, master, 1_000_000, undefined, {
    marketPcr: chain.pcr / 3, // far enough apart to trip the default 40% gate
  });
  assert.equal(sig.actionable, false);
  assert.equal(sig.blocked_reason, "PCR_DIVERGENCE");
});

test("agreeing PCR does not block an otherwise-qualifying signal", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  // Dwell requires the same setup to qualify for signalDwellTicks
  // consecutive evaluations before arming — the same setup here every
  // call, so this reaches actionable on the last of the loop.
  let sig;
  for (let i = 0; i < DEFAULT_CONFIG.signalDwellTicks; i++) {
    sig = engine.evaluate(chain, master, 1_000_000, undefined, { marketPcr: chain.pcr });
  }
  assert.equal(sig!.actionable, true);
});

test("futures OI buildup contradicting the thesis holds the signal", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  const sig = engine.evaluate(chain, master, 1_000_000, undefined, {
    buildupClass: "Short Built Up", // contradicts the CE thesis Alpha selects here
  });
  assert.equal(sig.option_type, "CE");
  assert.equal(sig.actionable, false);
  assert.equal(sig.blocked_reason, "BUILDUP_MISMATCH");
});

test("no capital means no actionable signal", () => {
  const { master, ticks, builder, engine } = warmEngine(24_300, WALLS);
  const chain = builder.build(master, ticks, 24_300);
  const sig = engine.evaluate(chain, master, 1_000);
  assert.equal(sig.actionable, false);
  assert.equal(sig.sizing!.lots, 0);
});

/* ------------------------------------------------------------------ ledger */

function openPos(l: Ledger, price = 100, lots = 2) {
  return l.open({
    underlying: "NIFTY", token: "1001", tradingSymbol: "NIFTY24500CE",
    quantity: lots * 75, lots, lotSize: 75, price,
    optionType: "CE", strike: 24_500, stopLoss: 75, target: 150, mode: "paper",
  });
}

test("slippage moves against the taker", () => {
  assert.equal(applySlippage(100, "BUY", 0.01), 101);
  assert.equal(applySlippage(100, "SELL", 0.01), 99);
});

test("unrealised PnL marks to the live feed", () => {
  const l = new Ledger(500_000, 0.0015, 25);
  openPos(l);
  const ticks = new TickStore();
  const t = emptyTick("1001"); t.ltp = 120; ticks.apply(t);
  l.markToMarket(ticks);
  assert.equal(l.openPositions[0].unrealised_pnl, 20 * 150);
  assert.equal(l.openPositions[0].pnl_pct, 20);
});

test("close books realised PnL and charges", () => {
  const l = new Ledger(500_000, 0.0015, 25);
  const pos = openPos(l);
  const closed = l.close(pos.id, 130, "TARGET")!;
  assert.equal(closed.realised_pnl, 30 * 150);
  assert.equal(closed.status, "CLOSED");
  assert.equal(l.openPositions.length, 0);
  assert.equal(l.realised, 4500);
});

test("scale-out keeps the residual, full scale-out closes", () => {
  const l = new Ledger(500_000, 0.0015, 25);
  const pos = openPos(l, 100, 4);
  l.reduce(pos.id, 2, 120);
  assert.equal(l.get(pos.id)!.lots, 2);
  assert.equal(l.get(pos.id)!.quantity, 150);
  assert.equal(l.realised, 20 * 150);
  l.reduce(pos.id, 2, 120);
  assert.equal(l.get(pos.id), undefined);
});

test("restore re-admits a position into live monitoring — mark-to-market and the stop-loss watchdog both reach it", async () => {
  // Session 1 opens the position, then the tab closes — nothing here
  // survives except what a DB checkpoint would have captured.
  const session1 = new Ledger(500_000, 0, 25);
  const opened = openPos(session1, 100, 2); // stop 75, target 150

  // Session 2 starts fresh and knows nothing until it is restored.
  const session2 = new Ledger(500_000, 0, 25);
  assert.equal(session2.openPositions.length, 0);
  session2.restore(opened);
  assert.equal(session2.openPositions.length, 1);
  assert.equal(session2.capital, 500_000); // restoring touches no capital or charges
  assert.equal(session2.charges, 0);

  const ticks = new TickStore();
  const up = emptyTick("1001"); up.ltp = 120; ticks.apply(up);
  session2.markToMarket(ticks);
  assert.equal(session2.get(opened.id)!.unrealised_pnl, 20 * 150);

  let exitedId: string | null = null;
  const stopTick = emptyTick("1001"); stopTick.ltp = 70; ticks.apply(stopTick);
  await checkStops({
    ledger: session2,
    chains: {},
    rrg: {},
    cfg: DEFAULT_CONFIG,
    ltp: (token) => ticks.ltp(token),
    exit: async (pos) => { exitedId = pos.id; },
    scaleOut: async () => {},
    trail: async () => {},
    log: () => {},
    scaled: new Set<string>(),
    daylightRestDone: true,
    onDaylightRestDone: () => {},
  });
  assert.equal(exitedId, opened.id);
});

test("restore is idempotent — an id already held stays the live copy, not the restore attempt", () => {
  const l = new Ledger(500_000, 0, 25);
  const pos = openPos(l);
  const before = l.openPositions.length;
  l.restore({ ...pos, ltp: 999 });
  assert.equal(l.openPositions.length, before);
  assert.equal(l.get(pos.id)!.ltp, pos.ltp);
});

test("a scaled-out position carries nonzero realised P&L while still open — the signal restore uses to know it was already scaled once", () => {
  const l = new Ledger(500_000, 0, 25);
  const pos = openPos(l, 100, 4);
  l.reduce(pos.id, 2, 120);
  assert.notEqual(l.get(pos.id)!.realised_pnl, 0);
});

/* --------------------------------------------------------- circuit breakers */

test("0.35% invalidation band", () => {
  const pct = DEFAULT_CONFIG.invalidationPct;
  assert.equal(breach(24_300 - 100, 24_300, "below", pct), true);
  assert.equal(breach(24_300 - 50, 24_300, "below", pct), false);
  assert.equal(breach(24_800 + 100, 24_800, "above", pct), true);
  assert.equal(breach(24_800 + 50, 24_800, "above", pct), false);
  assert.equal(breach(24_500, null, "below", pct), false);
});

test("weakeningCorroborated requires a real adverse move, not just theta drift", () => {
  assert.equal(weakeningCorroborated("CE", 24_000, 24_000, 0.05), false); // flat spot — theta only
  assert.equal(weakeningCorroborated("CE", 24_000, 23_988, 0.05), false); // inside the band
  assert.equal(weakeningCorroborated("CE", 24_000, 23_980, 0.05), true); // outside, against a call
  assert.equal(weakeningCorroborated("PE", 24_000, 24_020, 0.05), true); // outside, against a put
  assert.equal(weakeningCorroborated("PE", 24_000, 23_980, 0.05), false); // moved in the put's favour
  assert.equal(weakeningCorroborated("CE", 0, 24_000, 0.05), true); // no baseline to gate on
});

test("weakening scale-out is suppressed on a flat tape and fires on a real pullback", async () => {
  async function scenario(spotNow: number): Promise<boolean> {
    const ledger = new Ledger(500_000, 0, 25);
    ledger.open({
      underlying: "NIFTY", token: "1001", tradingSymbol: "NIFTY23900CE",
      quantity: 150, lots: 2, lotSize: 75, price: 100,
      optionType: "CE", strike: 23_900, stopLoss: 75, target: 150,
      entrySpot: 24_000, mode: "paper",
    });
    const ticks = new TickStore();
    const t = emptyTick("1001"); t.ltp = 105; // still a winner
    ticks.apply(t);
    ledger.markToMarket(ticks);

    let scaledOut = false;
    await checkWeakeningRotation({
      ledger,
      chains: { NIFTY: { spot: spotNow } as unknown as OptionChain },
      rrg: { NIFTY: { quadrant: () => "WEAKENING" } as unknown as RrgEngine },
      cfg: DEFAULT_CONFIG,
      ltp: () => 0,
      exit: async () => {},
      scaleOut: async () => { scaledOut = true; },
      trail: async () => {},
      log: () => {},
      scaled: new Set<string>(),
      daylightRestDone: true,
      onDaylightRestDone: () => {},
    });
    return scaledOut;
  }

  assert.equal(await scenario(24_000), false); // premium drifted, spot did not
  assert.equal(await scenario(23_950), true); // spot actually pulled back
});

test("a Weakening rotation on a 1-lot position locks the stop to breakeven instead of scaling out", async () => {
  const ledger = new Ledger(500_000, 0, 25);
  ledger.open({
    underlying: "NIFTY", token: "1001", tradingSymbol: "NIFTY23900CE",
    quantity: 75, lots: 1, lotSize: 75, price: 100,
    optionType: "CE", strike: 23_900, stopLoss: 75, target: 150,
    entrySpot: 24_000, mode: "paper",
  });
  const ticks = new TickStore();
  const t = emptyTick("1001"); t.ltp = 105; // a winner
  ticks.apply(t);
  ledger.markToMarket(ticks);

  let scaledOut = false;
  let trailedTo: number | null = null;
  await checkWeakeningRotation({
    ledger,
    chains: { NIFTY: { spot: 23_950 } as unknown as OptionChain }, // real pullback, corroborated
    rrg: { NIFTY: { quadrant: () => "WEAKENING" } as unknown as RrgEngine },
    cfg: DEFAULT_CONFIG,
    ltp: () => 0,
    exit: async () => {},
    scaleOut: async () => { scaledOut = true; },
    trail: async (_pos, newStop) => { trailedTo = newStop; },
    log: () => {},
    scaled: new Set<string>(),
    daylightRestDone: true,
    onDaylightRestDone: () => {},
  });

  assert.equal(scaledOut, false); // can't reduce a 1-lot position
  assert.equal(trailedTo, 100); // locked to breakeven (avg_price) instead
});

test("decideTrail: no move yet, breakeven at 1R, trails behind price past 2R, never loosens", () => {
  // Below 1R favourable move — nothing to do yet.
  assert.equal(
    decideTrail({ side: "BUY", avgPrice: 100, stopLoss: 75, ltp: 110, riskPoints: 25 }),
    null,
  );

  // At exactly 1R — ratchets to breakeven.
  assert.equal(
    decideTrail({ side: "BUY", avgPrice: 100, stopLoss: 75, ltp: 125, riskPoints: 25 }),
    100,
  );

  // Past 2R — trails a further R behind the current price instead of
  // sitting fixed at breakeven.
  assert.equal(
    decideTrail({ side: "BUY", avgPrice: 100, stopLoss: 75, ltp: 160, riskPoints: 25 }),
    135, // 160 - 25
  );

  // Never loosens: a stop already better than what this tick would propose
  // is left alone.
  assert.equal(
    decideTrail({ side: "BUY", avgPrice: 100, stopLoss: 140, ltp: 160, riskPoints: 25 }),
    null,
  );

  // Short side is the mirror image throughout.
  assert.equal(
    decideTrail({ side: "SELL", avgPrice: 100, stopLoss: 125, ltp: 75, riskPoints: 25 }),
    100,
  );
  assert.equal(
    decideTrail({ side: "SELL", avgPrice: 100, stopLoss: 125, ltp: 40, riskPoints: 25 }),
    65, // 40 + 25
  );
});

test("checkTrailingStop ratchets a favourable position's stop and leaves a flat one alone", async () => {
  const ledger = new Ledger(500_000, 0, 25);
  ledger.open({
    underlying: "NIFTY", token: "1001", tradingSymbol: "NIFTY23900CE",
    quantity: 75, lots: 1, lotSize: 75, price: 100,
    optionType: "CE", strike: 23_900, stopLoss: 75, target: 300,
    protocol: "ALPHA", mode: "paper",
  });

  const trailedStops: number[] = [];
  const deps = {
    ledger,
    chains: {},
    rrg: {},
    cfg: DEFAULT_CONFIG, // stopPctByProtocol.ALPHA = 0.25 -> riskPoints = 100*0.25 = 25
    ltp: () => 125, // exactly 1R favourable
    exit: async () => {},
    scaleOut: async () => {},
    // Mirrors `bookTrail` in useEngine.ts: the guard only proposes a new
    // stop, this is what actually applies it — without that, a second
    // pass would keep seeing the stale stop and keep re-proposing the
    // same move forever.
    trail: async (pos: { id: string }, newStop: number) => {
      trailedStops.push(newStop);
      ledger.tightenStop(pos.id, newStop);
    },
    log: () => {},
    scaled: new Set<string>(),
    daylightRestDone: true,
    onDaylightRestDone: () => {},
  };

  await checkTrailingStop(deps);
  assert.deepEqual(trailedStops, [100]); // moved to breakeven

  // A second pass at the same price proposes nothing new — already there.
  await checkTrailingStop(deps);
  assert.deepEqual(trailedStops, [100]);
});

test("wallStopPoints: anchors to the same line checkInvalidation would exit at, both sides", () => {
  const invalidationPct = 0.5;
  const itmDeltaApprox = 0.7;

  // CE — Aegis-1 minus its own invalidation band, distance to spot × delta approx.
  // band = 24000*0.5% = 120; invalidation line = 23880; distance = 620; ×0.7 = 434.
  assert.equal(
    wallStopPoints({
      optionType: "CE", spot: 24_500, aegis1: 24_000, zenith1: null,
      invalidationPct, itmDeltaApprox,
    }),
    434,
  );

  // PE — Zenith-1 plus its own band.
  // band = 25000*0.5% = 125; invalidation line = 25125; distance = 625; ×0.7 = 437.5.
  assert.equal(
    wallStopPoints({
      optionType: "PE", spot: 24_500, zenith1: 25_000, aegis1: null,
      invalidationPct, itmDeltaApprox,
    }),
    437.5,
  );

  // No wall data on this option's own side — nothing to anchor to.
  assert.equal(
    wallStopPoints({
      optionType: "CE", spot: 24_500, aegis1: null, zenith1: 25_000,
      invalidationPct, itmDeltaApprox,
    }),
    null,
  );

  // Spot is already through the invalidation band — that exit belongs to
  // `checkInvalidation`, not a stop/trail derived from this distance.
  assert.equal(
    wallStopPoints({
      optionType: "CE", spot: 23_800, aegis1: 24_000, zenith1: null,
      invalidationPct, itmDeltaApprox,
    }),
    null,
  );
});

test("checkWallTrail tightens a CE long's stop toward Aegis-1 and is idempotent at the same price", async () => {
  const cfg = { ...DEFAULT_CONFIG, invalidationPct: 0.2, itmDeltaApprox: 0.5 };
  // band = 24500*0.2% = 49; invalidation line = 24451; distance = 49; ×0.5 = 24.5.
  // candidate = ltp(130) - 24.5 = 105.5 — above the existing 60, an improvement.

  const ledger = new Ledger(500_000, 0, 25);
  ledger.open({
    underlying: "NIFTY", token: "1001", tradingSymbol: "NIFTY23900CE",
    quantity: 75, lots: 1, lotSize: 75, price: 100,
    optionType: "CE", strike: 23_900, stopLoss: 60, target: 300, mode: "paper",
  });

  const trailedStops: number[] = [];
  const deps = {
    ledger,
    chains: { NIFTY: { spot: 24_500, levels: { aegis_1: 24_500, zenith_1: null } } as unknown as OptionChain },
    rrg: {},
    cfg,
    ltp: () => 130,
    exit: async () => {},
    scaleOut: async () => {},
    trail: async (pos: { id: string }, newStop: number) => {
      trailedStops.push(newStop);
      ledger.tightenStop(pos.id, newStop);
    },
    log: () => {},
    scaled: new Set<string>(),
    daylightRestDone: true,
    onDaylightRestDone: () => {},
  };

  await checkWallTrail(deps);
  assert.deepEqual(trailedStops, [105.5]);

  // Same price, same wall — nothing further to improve.
  await checkWallTrail(deps);
  assert.deepEqual(trailedStops, [105.5]);
});

test("Ledger.addToPosition blends avg_price by quantity, applies the caller's stop/target, and charges the add leg", () => {
  const ledger = new Ledger(500_000, 0, 25);
  const pos = ledger.open({
    underlying: "NIFTY", token: "1001", tradingSymbol: "NIFTY23900CE",
    quantity: 75, lots: 1, lotSize: 75, price: 100,
    optionType: "CE", strike: 23_900, stopLoss: 75, target: 300,
    protocol: "ALPHA", mode: "paper",
  });
  const chargesAfterOpen = ledger.charges;
  const capitalAfterOpen = ledger.capital;

  const updated = ledger.addToPosition(pos.id, 1, 150, 110, 350);
  assert.ok(updated);
  // (100*75 + 150*75) / 150 = 125.
  assert.equal(updated!.avg_price, 125);
  assert.equal(updated!.quantity, 150);
  assert.equal(updated!.lots, 2);
  assert.equal(updated!.stop_loss, 110);
  assert.equal(updated!.target, 350);

  const addCost = Math.max(25, estimateCharges({ side: "BUY", price: 150, quantity: 75 }).total);
  assert.equal(ledger.charges, Number((chargesAfterOpen + addCost).toFixed(2)));
  assert.equal(ledger.capital, Number((capitalAfterOpen - addCost).toFixed(2)));
  // `deployed`/`equity` are derived off avg_price/quantity — no separate bookkeeping needed.
  assert.equal(ledger.deployed, 125 * 150);

  // A null stop/target from the caller leaves whatever is already there.
  const again = ledger.addToPosition(pos.id, 1, 200, null, null);
  assert.equal(again!.stop_loss, 110);
  assert.equal(again!.target, 350);

  assert.equal(ledger.addToPosition("nope", 1, 100, null, null), null);
  assert.equal(ledger.addToPosition(pos.id, 0, 100, null, null), null);
});

test("decideScaleIn gates on quadrant, 1R profit, wall room, VIX Panic and one-add-per-session", () => {
  const cfg = { ...DEFAULT_CONFIG, invalidationPct: 0.5, itmDeltaApprox: 0.7 };
  const pos: Position = {
    id: "DK-1", underlying: "NIFTY", token: "1001", trading_symbol: "NIFTY23900CE",
    option_type: "CE", strike: 23_900, side: "BUY", quantity: 75, lots: 1, lot_size: 75,
    avg_price: 100, ltp: 100, entry_spot: 24_500, stop_loss: 75, target: 300,
    unrealised_pnl: 0, realised_pnl: 0, pnl_pct: 0, protocol: "ALPHA",
    opened_at: "", closed_at: null, exit_price: null, exit_reason: null,
    status: "OPEN", mode: "paper", automation: "manual", broker: null,
  };
  // riskPoints = 100 * stopPctByProtocol.ALPHA(0.25) = 25 -> 1R at ltp 125.
  const base = {
    pos, spot: 24_500, aegis1: 24_000, zenith1: null,
    quadrant: "LEADING" as const, vixRegime: "Normal" as const,
    alreadyScaledIn: false, cfg,
  };

  const eligible = decideScaleIn({ ...base, ltp: 125 });
  assert.ok(eligible);
  assert.equal(eligible!.addLots, 1);
  // blendedAvg = (100*75 + 125*75) / 150 = 112.5; wallStopPoints(same inputs as
  // the wallStopPoints test) = 434 -> newStop = 112.5 - 434, floored by nothing
  // here (deep OTM band on purpose — the test only needs the arithmetic, not realism).
  assert.equal(eligible!.newStop, Number((112.5 - 434).toFixed(2)));
  // target distance preserved: original was +200 from avg_price -> +200 from blendedAvg.
  assert.equal(eligible!.newTarget, Number((112.5 + 200).toFixed(2)));

  // Not yet 1R favourable.
  assert.equal(decideScaleIn({ ...base, ltp: 110 }), null);
  // Weakening/Lagging is checkWeakeningRotation's territory, never an add candidate.
  assert.equal(decideScaleIn({ ...base, ltp: 125, quadrant: "WEAKENING" }), null);
  assert.equal(decideScaleIn({ ...base, ltp: 125, quadrant: "LAGGING" }), null);
  // Improving is as eligible as Leading.
  assert.ok(decideScaleIn({ ...base, ltp: 125, quadrant: "IMPROVING" }));
  // Panic VIX refuses regardless of everything else lining up.
  assert.equal(decideScaleIn({ ...base, ltp: 125, vixRegime: "Panic" }), null);
  // Already added once this session.
  assert.equal(decideScaleIn({ ...base, ltp: 125, alreadyScaledIn: true }), null);
  // Wall breached (spot already through the invalidation band) — no room to add.
  assert.equal(decideScaleIn({ ...base, ltp: 125, spot: 23_800 }), null);
  // No wall on this option's own side at all.
  assert.equal(decideScaleIn({ ...base, ltp: 125, aegis1: null, zenith1: null }), null);
  // Delta never carries a live position — nothing to add to.
  assert.equal(
    decideScaleIn({ ...base, ltp: 125, pos: { ...pos, protocol: "DELTA" } }),
    null,
  );
});

test("decideExit prioritises stop and target over the daylight clock, for both sides", () => {
  const long = { side: "BUY" as const, stopLoss: 100, target: 150 };
  assert.deepEqual(
    decideExit({ ...long, ltp: 99, daylightRestDue: false }),
    { action: "STOP_LOSS" },
  );
  assert.deepEqual(
    decideExit({ ...long, ltp: 151, daylightRestDue: false }),
    { action: "TARGET" },
  );
  assert.deepEqual(
    decideExit({ ...long, ltp: 125, daylightRestDue: false }),
    { action: "HOLD" },
  );
  assert.deepEqual(
    decideExit({ ...long, ltp: 125, daylightRestDue: true }),
    { action: "DAYLIGHT_REST" },
  );
  // A stop hit exactly at 3:15 PM is still a stop, not a daylight-rest exit —
  // matches runGuards' order (checkStops before checkDaylightRest).
  assert.deepEqual(
    decideExit({ ...long, ltp: 99, daylightRestDue: true }),
    { action: "STOP_LOSS" },
  );

  const short = { side: "SELL" as const, stopLoss: 150, target: 100 };
  assert.deepEqual(
    decideExit({ ...short, ltp: 151, daylightRestDue: false }),
    { action: "STOP_LOSS" },
  );
  assert.deepEqual(
    decideExit({ ...short, ltp: 99, daylightRestDue: false }),
    { action: "TARGET" },
  );
});

test("decideExit holds with no stop or target set, unless the daylight clock is due", () => {
  assert.deepEqual(
    decideExit({ side: "BUY", stopLoss: null, target: null, ltp: 100, daylightRestDue: false }),
    { action: "HOLD" },
  );
  assert.deepEqual(
    decideExit({ side: "BUY", stopLoss: null, target: null, ltp: 100, daylightRestDue: true }),
    { action: "DAYLIGHT_REST" },
  );
});

test("daylight rest countdown is bounded and monotonic", () => {
  const s = secondsToDaylightRest();
  assert.ok(s >= 0 && s <= 15 * 3600 + 15 * 60);
});

/* ------------------------------------------ SmartStream binary decoding */

function snapQuote(token = "35005", ltp = 187.25, oi = 512_000): ArrayBuffer {
  const buf = new ArrayBuffer(379);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  view.setUint8(0, 3); // snap quote
  view.setUint8(1, 2); // NSE F&O
  bytes.set(new TextEncoder().encode(token), 2);
  view.setBigInt64(27, 1n, true);
  view.setBigInt64(35, 1_700_000_000_000n, true);
  view.setBigInt64(43, BigInt(Math.round(ltp * 100)), true);
  view.setBigInt64(67, 1_250_000n, true);
  view.setBigInt64(91, 18_000n, true);
  view.setBigInt64(99, 20_000n, true);
  view.setBigInt64(107, 17_000n, true);
  view.setBigInt64(115, 18_500n, true);
  view.setBigInt64(131, BigInt(oi), true);
  view.setFloat64(139, 4.5, true);
  view.setInt16(147, 1, true);
  view.setBigInt64(157, BigInt(Math.round(187.1 * 100)), true);
  view.setInt16(167, 0, true);
  view.setBigInt64(177, BigInt(Math.round(187.4 * 100)), true);
  return buf;
}

test("decodes a mode-3 snap quote packet", () => {
  const t = decodePacket(snapQuote())!;
  assert.equal(t.token, "35005");
  assert.equal(t.ltp, 187.25);
  assert.equal(t.volume, 1_250_000);
  assert.equal(t.oi, 512_000);
  assert.equal(t.close, 185);
  assert.equal(t.bestBid, 187.1);
  assert.equal(t.bestAsk, 187.4);
});

test("rejects truncated frames", () => {
  assert.equal(decodePacket(new ArrayBuffer(2)), null);
});

test("tick store tracks intraday OI change and carries fields forward", () => {
  const s = new TickStore();
  const a = emptyTick("35005"); a.ltp = 100; a.oi = 400_000; a.volume = 999; a.close = 95;
  s.apply(a);
  const b = emptyTick("35005"); b.ltp = 101; b.oi = 460_000;
  s.apply(b);
  assert.equal(s.oiChange("35005"), 60_000);
  assert.equal(s.prevLtp("35005"), 100);
  assert.equal(s.get("35005")!.volume, 999);
  assert.equal(s.get("35005")!.close, 95);
});

test("the next midnight IST is always still ahead, whatever time of day it's asked from", () => {
  // 06:30 UTC = 12:00 IST on 2026-08-01 — midnight IST that ends the day is
  // 2026-08-01 18:30 UTC.
  assert.equal(
    nextMidnightIst(new Date("2026-08-01T06:30:00Z")).toISOString(),
    "2026-08-01T18:30:00.000Z",
  );
  // A minute before that boundary, and a minute after it: the answer should
  // jump to the *next* day's midnight the instant the first one passes.
  assert.equal(
    nextMidnightIst(new Date("2026-08-01T18:29:00Z")).toISOString(),
    "2026-08-01T18:30:00.000Z",
  );
  assert.equal(
    nextMidnightIst(new Date("2026-08-01T18:31:00Z")).toISOString(),
    "2026-08-02T18:30:00.000Z",
  );
});

test("the next-open clock skips the weekend", () => {
  // Saturday noon IST — the next bell is Monday's, two days and 2h45m out.
  assert.equal(secondsToNextOpen(new Date("2026-08-01T06:30:00Z")), 162_900);
  // Monday 08:00 IST, before the bell.
  assert.equal(secondsToNextOpen(new Date("2026-08-03T02:30:00Z")), 4_500);
  // Monday 16:00 IST, after the close — tomorrow's bell.
  assert.equal(secondsToNextOpen(new Date("2026-08-03T10:30:00Z")), 62_100);
});

/* ------------------------------------------------------------- tick plan */

const plan = (patch: Partial<Parameters<typeof planTick>[0]> = {}) =>
  planTick({
    marketOpen: false,
    simulated: false,
    printsChanged: false,
    seedsChanged: false,
    hasChains: true,
    ...patch,
  });

test("a connected socket out of hours settles the board instead of running it", () => {
  // The exact state that kept the loop advancing all weekend: SmartStream is
  // connected and reports "live", but the exchange is shut and nothing prints.
  const p = plan({ printsChanged: false });
  assert.equal(p.advance, false);
  assert.equal(p.rebuild, false);
  assert.equal(p.guards, false);
  assert.equal(p.settled, true);

  // Even a print out of hours must not advance rotation.
  const stray = plan({ printsChanged: true });
  assert.equal(stray.advance, false);
  assert.equal(stray.rebuild, false);
});

test("replayed history rebuilds the board without advancing rotation", () => {
  // The replay feeds the RRG windows itself; the rebuild that shows the result
  // must not stamp another sample on top of it.
  const p = plan({ seedsChanged: true });
  assert.equal(p.rebuild, true);
  assert.equal(p.advance, false);
  assert.equal(p.settled, false);
});

test("the first chain is always built, even with nothing flowing", () => {
  const p = plan({ hasChains: false });
  assert.equal(p.rebuild, true);
  assert.equal(p.settled, false);
});

test("a live session advances on prints, and guards run through quiet ticks", () => {
  const printing = plan({ marketOpen: true, printsChanged: true });
  assert.deepEqual(printing, {
    advance: true,
    rebuild: true,
    guards: true,
    settled: false,
  });

  // A silent second mid-session: nothing to recompute, but the 3:15 PM flatten
  // is a clock event and must still be able to fire.
  const quiet = plan({ marketOpen: true, printsChanged: false });
  assert.equal(quiet.advance, false);
  assert.equal(quiet.rebuild, false);
  assert.equal(quiet.guards, true);
});

test("the simulated feed is its own market at any hour", () => {
  const p = plan({ simulated: true, printsChanged: true });
  assert.equal(p.advance, true);
  assert.equal(p.guards, true);
});

/* -------------------------------------------------------------- charges */

test("charges follow the leg: STT on the sell, stamp duty on the buy", () => {
  const qty = 75;
  const price = 200; // ₹15,000 of premium turnover
  const buy = estimateCharges({ side: "BUY", price, quantity: qty });
  const sell = estimateCharges({ side: "SELL", price, quantity: qty });

  assert.equal(buy.turnover, 15_000);
  // STT is 0.15% of the sell premium (Budget 2026, effective 2026-04-01), and is not levied on a purchase.
  assert.equal(buy.stt, 0);
  assert.equal(sell.stt, 22.5);
  // Stamp duty is the mirror image.
  assert.equal(sell.stamp, 0);
  assert.equal(buy.stamp, 0.45);

  // Brokerage is the flat fee until 0.25% of turnover is cheaper.
  assert.equal(buy.brokerage, 20);
  assert.equal(estimateCharges({ side: "BUY", price: 1, quantity: 75 }).brokerage, 0.19);

  // GST rides brokerage and the exchange/SEBI fees, never STT or stamp duty.
  const taxable = buy.brokerage + buy.exchange + buy.sebi + buy.ipft;
  assert.equal(buy.gst, Number((taxable * 0.18).toFixed(2)));
  assert.equal(
    buy.total,
    Number(
      (buy.brokerage + buy.exchange + buy.sebi + buy.ipft + buy.stamp + buy.gst).toFixed(2),
    ),
  );
});

test("a zero-turnover leg costs nothing at all", () => {
  const none = estimateCharges({ side: "BUY", price: 0, quantity: 75 });
  assert.equal(none.total, 0);
  assert.equal(none.brokerage, 0);
});

test("a round trip is priced at entry and at the assumed exit", () => {
  const trip = roundTripCharges({ price: 100, quantity: 75 }, 150);
  // The exit leg is dearer: it carries STT, on a larger premium.
  assert.ok(trip.exit.total > trip.entry.total);
  assert.equal(trip.total, Number((trip.entry.total + trip.exit.total).toFixed(2)));
  assert.equal(trip.exit.stt, Number((150 * 75 * NSE_OPTIONS_RATES.sttSellPct).toFixed(2)));
});

test("the ledger books real charges on both legs, never below the minimum", () => {
  const ledger = new Ledger(100_000, 0, 25);
  const pos = ledger.open({
    underlying: "NIFTY",
    token: "1",
    tradingSymbol: "NIFTY24450PE",
    quantity: 75,
    lots: 1,
    lotSize: 75,
    price: 200,
    mode: "paper",
  });

  const entry = estimateCharges({ side: "BUY", price: 200, quantity: 75 });
  assert.ok(entry.total > 25, "entry charges should exceed the flat minimum here");
  assert.equal(ledger.snapshot("paper").charges, entry.total);

  ledger.close(pos.id, 260, "TARGET");
  const exit = estimateCharges({ side: "SELL", price: 260, quantity: 75 });
  const total = Number((entry.total + exit.total).toFixed(2));
  assert.equal(ledger.snapshot("paper").charges, total);

  // Capital moved by the gross P&L less both legs' charges.
  assert.equal(
    ledger.snapshot("paper").capital,
    Number((100_000 + (260 - 200) * 75 - total).toFixed(2)),
  );
});

test("a nearly worthless contract still pays the broker's minimum", () => {
  const ledger = new Ledger(100_000, 0, 25);
  ledger.open({
    underlying: "NIFTY",
    token: "1",
    tradingSymbol: "NIFTY24450PE",
    quantity: 75,
    lots: 1,
    lotSize: 75,
    price: 0.05,
    mode: "paper",
  });
  assert.equal(ledger.snapshot("paper").charges, 25);
});

/* ------------------------------------------------------------------ retry */

test("withRetry returns on the first success without waiting", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    return "ok";
  }, 3, 5);
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("withRetry retries a failing call up to the attempt limit, then throws", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls += 1;
        throw new Error(`fail ${calls}`);
      }, 3, 1),
    /fail 3/,
  );
  assert.equal(calls, 3);
});

test("withRetry recovers once a later attempt succeeds", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 2) throw new Error("transient");
    return "recovered";
  }, 3, 1);
  assert.equal(result, "recovered");
  assert.equal(calls, 2);
});

/* ------------------------------------------------------------- the open/close switch */

test("a live tick always supersedes a seeded one once the market reopens", () => {
  const ticks = new TickStore();
  ticks.seedQuote("1001", { oi: 500, ltp: 42 });

  const live = emptyTick("1001");
  live.oi = 900;
  live.ltp = 45;
  ticks.apply(live);

  assert.equal(ticks.ltp("1001"), 45);
  assert.equal(ticks.get("1001")!.oi, 900);
});

test("a live frame that omits a field carries the seeded value forward instead of zeroing it", () => {
  const ticks = new TickStore();
  ticks.seedQuote("1001", { oi: 500 });

  // A snap-quote frame that happens to omit OI this tick must not read as
  // "OI is now zero" — the whole reason TickStore carries fields forward.
  const live = emptyTick("1001");
  live.ltp = 45;
  ticks.apply(live);

  assert.equal(ticks.get("1001")!.oi, 500);
  assert.equal(ticks.ltp("1001"), 45);
});

