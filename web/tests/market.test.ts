/**
 * Historical / market-data layer.
 *
 * These cover the parts that decide what the terminal *believes*: how a raw
 * Angel One payload becomes a session, which futures row a PCR reading is
 * taken from, what counts as a legal request window, and the open-interest
 * baseline the whole COA 2.0 layer is measured against.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  candleDate,
  futuresExpiry,
  parseBuildupRows,
  parseCandles,
  parseOiSeries,
  parsePcrRows,
  pcrForUnderlying,
  sessionSlice,
} from "../lib/market/parse";
import { parseHistoricalBody } from "../lib/market/request";
import {
  INTERVAL_MAX_DAYS,
  isBuildupType,
  spanDays,
  stampMs,
} from "../lib/market/constants";
import { MARKET_OPEN_STAMP, shiftDate } from "../lib/market/clock";
import {
  reconstructWallTrail,
  spotAtFactory,
} from "../lib/market/migration";
import { TickStore, emptyTick } from "../lib/stream/ticks";

/* ------------------------------------------------------------------ candles */

const bar = (time: string, close: number, extras: Partial<number[]> = []) => [
  time,
  extras[0] ?? close,
  extras[1] ?? close,
  extras[2] ?? close,
  close,
  100,
];

test("candles parse from positional tuples and sort oldest first", () => {
  const parsed = parseCandles([
    ["2024-08-19T09:16:00+05:30", 100, 105, 99, 104, 12],
    ["2024-08-19T09:15:00+05:30", 90, 101, 89, 100, 7],
    ["malformed"],
    [],
  ]);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].time, "2024-08-19T09:15:00+05:30");
  assert.deepEqual(
    [parsed[0].open, parsed[0].high, parsed[0].low, parsed[0].close, parsed[0].volume],
    [90, 101, 89, 100, 7],
  );
  assert.equal(candleDate(parsed[1]), "2024-08-19");
});

test("session slice keeps the last trading day and prices it off the prior close", () => {
  // Friday, then Monday: the weekend simply is not in the response, which is
  // how the window survives holidays without a calendar.
  const { session, stats } = sessionSlice(
    parseCandles([
      bar("2024-08-16T15:29:00+05:30", 24_000),
      bar("2024-08-19T09:15:00+05:30", 24_100, [24_050, 24_150, 24_040]),
      bar("2024-08-19T09:16:00+05:30", 24_240, [24_100, 24_300, 24_090]),
    ]),
  );

  assert.equal(session.length, 2);
  assert.equal(stats?.date, "2024-08-19");
  assert.equal(stats?.open, 24_050);
  assert.equal(stats?.high, 24_300);
  assert.equal(stats?.low, 24_040);
  assert.equal(stats?.close, 24_240);
  assert.equal(stats?.prev_close, 24_000);
  assert.equal(stats?.change, 240);
  assert.equal(stats?.change_pct, 1);
});

test("a session with no prior day quotes no change rather than guessing one", () => {
  const { stats } = sessionSlice(
    parseCandles([bar("2024-08-19T09:15:00+05:30", 24_100)]),
  );
  assert.equal(stats?.prev_close, null);
  assert.equal(stats?.change, null);
  assert.equal(stats?.change_pct, null);
});

test("empty candle payloads produce no session", () => {
  assert.deepEqual(sessionSlice([]), { session: [], stats: null });
  assert.deepEqual(parseCandles(null), []);
});

/* ----------------------------------------------------------------- oi data */

test("oi series parses and orders by time", () => {
  const series = parseOiSeries([
    { time: "2024-08-19T12:24:00+05:30", oi: 166_100 },
    { time: "2024-08-19T09:15:00+05:30", oi: 140_000 },
    { nonsense: true },
  ]);
  assert.deepEqual(
    series.map((p) => p.oi),
    [140_000, 166_100],
  );
});

/* --------------------------------------------------------------------- pcr */

test("PCR maps to the underlying's near futures, and NIFTY never eats BANKNIFTY", () => {
  const rows = parsePcrRows([
    { pcr: 1.04, tradingSymbol: "NIFTY25JAN24FUT" },
    { pcr: 0.91, tradingSymbol: "NIFTY29FEB24FUT" },
    { pcr: 0.58, tradingSymbol: "BANKNIFTY25JAN24FUT" },
    { pcr: 0.65, tradingSymbol: "ADANIPORTS25JAN24FUT" },
  ]);

  assert.equal(pcrForUnderlying(rows, "NIFTY", "2024-01-02")?.pcr, 1.04);
  assert.equal(pcrForUnderlying(rows, "BANKNIFTY", "2024-01-02")?.pcr, 0.58);
  // Past the January expiry, the next contract is the live one.
  assert.equal(pcrForUnderlying(rows, "NIFTY", "2024-01-26")?.pcr, 0.91);
  assert.equal(pcrForUnderlying(rows, "FINNIFTY", "2024-01-02"), null);
});

test("futures expiry parses to a sortable date", () => {
  assert.equal(futuresExpiry("NIFTY25JAN24FUT"), "2024-01-25");
  assert.equal(futuresExpiry("NIFTY25JAN24CE"), null);
  assert.equal(futuresExpiry("NIFTY25XXX24FUT"), null);
});

/* ---------------------------------------------------------------- buildup */

test("buildup rows arrive as strings and come out as numbers", () => {
  const rows = parseBuildupRows([
    {
      symbolToken: "55424",
      ltp: "723.8",
      netChange: "-28.25",
      percentChange: "-3.76",
      opnInterest: "24982.5",
      netChangeOpnInterest: "-76.25",
      tradingSymbol: "JINDALSTEL25JAN24FUT",
    },
    { ltp: "1" },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ltp, 723.8);
  assert.equal(rows[0].oi_change, -76.25);
  assert.equal(rows[0].open_interest, 24982.5);
  assert.equal(rows[0].symbol_token, "55424");
});

test("buildup datatypes are matched exactly as Angel One spells them", () => {
  assert.ok(isBuildupType("Long Built Up"));
  assert.ok(isBuildupType("Short Covering"));
  assert.ok(!isBuildupType("Long  Built Up"));
  assert.ok(!isBuildupType("long built up"));
});

/* ------------------------------------------------------------- validation */

const window = {
  exchange: "NFO",
  symboltoken: "46823",
  interval: "THREE_MINUTE",
  fromdate: "2023-09-06 11:15",
  todate: "2023-09-06 12:00",
};

test("a well-formed historical request is rebuilt field by field", () => {
  const parsed = parseHistoricalBody({ ...window, injected: "rm -rf" });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.body, window);
});

test("historical requests are rejected before they cost an upstream call", () => {
  const reject = (patch: Record<string, unknown>) => {
    const parsed = parseHistoricalBody({ ...window, ...patch });
    assert.ok(!parsed.ok, `expected rejection for ${JSON.stringify(patch)}`);
    return parsed.detail;
  };

  reject({ exchange: "NASDAQ" });
  reject({ symboltoken: "46823; DROP" });
  reject({ interval: "TWO_MINUTE" });
  reject({ fromdate: "2023-09-06" });
  reject({ fromdate: "2023-02-31 09:15" });
  reject({ fromdate: "2023-09-07 11:15", todate: "2023-09-06 12:00" });

  // ONE_MINUTE tops out at 30 days, and the message says so.
  const detail = reject({
    interval: "ONE_MINUTE",
    fromdate: "2023-07-06 09:15",
    todate: "2023-09-06 09:15",
  });
  assert.match(detail, /ONE_MINUTE allows at most 30 days/);
});

test("every documented interval carries its documented cap", () => {
  assert.equal(INTERVAL_MAX_DAYS.ONE_MINUTE, 30);
  assert.equal(INTERVAL_MAX_DAYS.FIFTEEN_MINUTE, 200);
  assert.equal(INTERVAL_MAX_DAYS.ONE_DAY, 2000);
  assert.equal(spanDays("2024-01-01 09:15", "2024-01-31 09:15"), 30);
  assert.equal(stampMs("2024-02-30 09:15"), null);
  assert.equal(stampMs("2024-02-29 09:15") !== null, true);
});

/* ------------------------------------------------------------------ clock */

test("date shifts stay in calendar space across month ends", () => {
  assert.equal(shiftDate("2024-03-01", -5), "2024-02-25");
  assert.equal(shiftDate("2024-01-01", -1), "2023-12-31");
  assert.equal(MARKET_OPEN_STAMP, "09:15");
});

/* ------------------------------------------------- COA 2.0 oi baselining */

test("a historical baseline corrects ΔOI for a session joined mid-day", () => {
  const ticks = new TickStore();
  // First frame this tab ever saw: OI already 150,000 by the time it connected.
  ticks.apply({ ...emptyTick("46823"), ltp: 100, oi: 150_000 });
  assert.equal(ticks.oiChange("46823"), 0);

  // The exchange says the day opened at 120,000 — the delta is 30,000, and the
  // wall the driver trades is built on that number, not on zero.
  assert.ok(ticks.seedSessionOpenOi("46823", 120_000));
  assert.equal(ticks.oiChange("46823"), 30_000);
  assert.equal(ticks.baselined, 1);

  // Later frames keep measuring against the same seeded open.
  ticks.apply({ ...emptyTick("46823"), ltp: 101, oi: 165_000 });
  assert.equal(ticks.oiChange("46823"), 45_000);

  // Junk never displaces a real baseline.
  assert.ok(!ticks.seedSessionOpenOi("46823", 0));
  assert.equal(ticks.oiChange("46823"), 45_000);
});

test("a seeded quote fills the board without passing for a live feed", () => {
  const ticks = new TickStore();
  ticks.seedQuote("46823", { ltp: 128.4, close: 131.2, volume: 91_000, oi: 166_100 });

  const tick = ticks.get("46823");
  assert.equal(tick?.ltp, 128.4);
  assert.equal(tick?.oi, 166_100);
  assert.equal(ticks.seeded, 1);
  // The Live-mode guard reads `updates`; Friday's closes must never satisfy it.
  assert.equal(ticks.updates, 0);

  // A real print supersedes the seed and does count.
  ticks.apply({ ...emptyTick("46823"), ltp: 130, oi: 167_000 });
  assert.equal(ticks.ltp("46823"), 130);
  assert.equal(ticks.updates, 1);

  // Zero and missing fields never overwrite what is already known.
  ticks.seedQuote("46823", { ltp: 0 });
  assert.equal(ticks.ltp("46823"), 130);
});

/* ------------------------------------------------------- wall migration */

test("wall migration rebuilds COA 2.0 bucket by bucket from historical OI", () => {
  // Three strikes, two buckets. Spot sits at 100 all session, so 90/100 are
  // candidates for Aegis and 100/110 for Zenith.
  const rows = [
    { strike: 90, putToken: "p90", callToken: "c90" },
    { strike: 100, putToken: "p100", callToken: "c100" },
    { strike: 110, putToken: "p110", callToken: "c110" },
  ];
  const t1 = "2024-08-19T09:15:00+05:30";
  const t2 = "2024-08-19T09:30:00+05:30";
  const at = (a: number, b: number) => [
    { time: t1, oi: a },
    { time: t2, oi: b },
  ];

  const trail = reconstructWallTrail(
    rows,
    {
      // Put writing starts at 90 and moves up to 100 — support rising.
      p90: at(1_000, 1_900),
      p100: at(1_000, 2_500),
      p110: at(1_000, 1_000),
      // Call writing starts at 100 and moves out to 110 — resistance lifting.
      c90: at(1_000, 1_000),
      c100: at(1_000, 1_400),
      c110: at(1_000, 1_100),
    },
    () => 100,
  );

  // The opening bucket has no build yet on either side, so it is not a reading.
  assert.deepEqual(trail.times, [t2]);
  assert.deepEqual(trail.aegis, [100]);
  assert.deepEqual(trail.zenith, [100]);
});

test("a bucket with no spot, or only one wall, is not plotted", () => {
  const rows = [{ strike: 100, putToken: "p", callToken: "c" }];
  const t = "2024-08-19T09:30:00+05:30";
  const series = { p: [{ time: t, oi: 10 }, { time: t, oi: 20 }] };

  // No call series at all — a one-sided bucket is dropped rather than half-drawn.
  assert.deepEqual(reconstructWallTrail(rows, series, () => 100).times, []);
  // No spot for the bucket — nothing can be classified above or below it.
  assert.deepEqual(reconstructWallTrail(rows, series, () => 0).times, []);
  assert.deepEqual(reconstructWallTrail(rows, {}, () => 100).times, []);
});

test("spot lookup takes the last bar at or before the bucket", () => {
  const spotAt = spotAtFactory(
    parseCandles([
      bar("2024-08-19T09:20:00+05:30", 24_100),
      bar("2024-08-19T09:16:00+05:30", 24_000),
    ]),
  );
  assert.equal(spotAt("2024-08-19T09:18:00+05:30"), 24_000);
  assert.equal(spotAt("2024-08-19T09:30:00+05:30"), 24_100);
  // Before the first bar there is nothing to take.
  assert.equal(spotAt("2024-08-19T09:15:00+05:30"), 0);
});
