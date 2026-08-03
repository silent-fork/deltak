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
import { ChainBuilder, itmDepth, nearestStrike } from "../lib/engine/coa";
import { buildupContradicts, classifyProtocol, SignalEngine } from "../lib/engine/dkms";
import { Ledger, applySlippage } from "../lib/engine/ledger";
import {
  NSE_OPTIONS_RATES,
  estimateCharges,
  roundTripCharges,
} from "../lib/engine/charges";
import {
  breach,
  checkStops,
  checkWeakeningRotation,
  decideExit,
  weakeningCorroborated,
} from "../lib/engine/risk";
import { planTick } from "../lib/engine/loop";
import { applyNseSnapshot } from "../lib/engine/nseSnapshot";
import { decodePacket } from "../lib/stream/smartstream";
import { TickStore, emptyTick } from "../lib/stream/ticks";
import { ScripMaster, type Instrument, type MasterPayload } from "../lib/engine/scripMaster";
import {
  DEFAULT_CONFIG,
  EXCHANGE_BSE_CM,
  EXCHANGE_BSE_FO,
  EXCHANGE_NSE_CM,
  EXCHANGE_NSE_FO,
  INDEX_UNIVERSE,
  nextMidnightIst,
  secondsToDaylightRest,
  secondsToNextOpen,
} from "../lib/engine/config";
import type { CoaLevels, OptionChain } from "../lib/types";
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
  const chain = builder.build(master, ticks, 24_500);
  chain.levels.aegis_shift = -3;
  chain.levels.zenith_shift = 0;
  const sig = engine.evaluate(chain, master, 1_000_000);
  assert.equal(sig.protocol, "GAMMA");
  assert.equal(sig.option_type, "PE");
  assert.ok(sig.strike! > chain.spot);
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
  const sig = engine.evaluate(chain, master, 1_000_000, undefined, { marketPcr: chain.pcr });
  assert.equal(sig.actionable, true);
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
  // STT is 0.10% of the sell premium, and is not levied on a purchase.
  assert.equal(buy.stt, 0);
  assert.equal(sell.stt, 15);
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

/* ------------------------------------------------- NSE snapshot & the open/close switch */

test("applyNseSnapshot fills a token that has no data yet", () => {
  const master = makeMaster();
  const ticks = new TickStore();
  const strike = 24_500;
  const token = master.find("NIFTY", strike, "CE")!.token;

  applyNseSnapshot(ticks, master, "NIFTY", {
    underlying: "NIFTY",
    spot: 24_774.3,
    timestamp: "03-Aug-2026 15:40:00",
    legs: [{ strike, side: "CE", oi: 12_345, changeInOi: 100, volume: 500, ltp: 42.5 }],
  });

  const tick = ticks.get(token)!;
  assert.equal(tick.oi, 12_345);
  assert.equal(tick.volume, 500);
  assert.equal(tick.ltp, 42.5);
});

test("applyNseSnapshot never overwrites a token that already has real OI", () => {
  const master = makeMaster();
  // Angel One's own replay (or a live print before the tab was left open
  // overnight) already seeded every contract's OI to 10,000 by default.
  const ticks = fillTicks(master, new TickStore());
  const strike = 24_500;
  const token = master.find("NIFTY", strike, "CE")!.token;
  const before = ticks.get(token)!.oi;

  applyNseSnapshot(ticks, master, "NIFTY", {
    underlying: "NIFTY",
    spot: 24_774.3,
    timestamp: "03-Aug-2026 15:40:00",
    legs: [{ strike, side: "CE", oi: 999_999, changeInOi: 0, volume: 0, ltp: 0 }],
  });

  // NSE's number is a different source of the same fact; whichever source
  // got there first is authoritative, so it must be left untouched.
  assert.equal(ticks.get(token)!.oi, before);
});

test("applyNseSnapshot seeds the spot only while it is still missing", () => {
  const master = makeMaster();
  const ticks = new TickStore();
  const spotToken = master.spotToken("NIFTY");

  applyNseSnapshot(ticks, master, "NIFTY", {
    underlying: "NIFTY",
    spot: 24_774.3,
    timestamp: "03-Aug-2026 15:40:00",
    legs: [],
  });
  assert.equal(ticks.get(spotToken)!.ltp, 24_774.3);

  applyNseSnapshot(ticks, master, "NIFTY", {
    underlying: "NIFTY",
    spot: 25_000,
    timestamp: "03-Aug-2026 15:45:00",
    legs: [],
  });
  // A second, different reading must not clobber the first.
  assert.equal(ticks.get(spotToken)!.ltp, 24_774.3);
});

test("applyNseSnapshot silently skips a leg with no matching contract", () => {
  const master = makeMaster();
  const ticks = new TickStore();

  assert.doesNotThrow(() =>
    applyNseSnapshot(ticks, master, "NIFTY", {
      underlying: "NIFTY",
      spot: 24_774.3,
      timestamp: "03-Aug-2026 15:40:00",
      // Far outside makeMaster()'s ±20-strike ladder — no contract to resolve to.
      legs: [{ strike: 999_999, side: "CE", oi: 1, changeInOi: 0, volume: 0, ltp: 0 }],
    }),
  );
});

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
