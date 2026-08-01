/**
 * Ledger → Supabase mapping.
 *
 * These exist because persistence failed silently for the whole life of the
 * serverless build: the engine posted its own `Position` objects at a table
 * with different columns, PostgREST rejected each batch whole, and the writes
 * being fire-and-forget meant nothing ever said so. The parity check below is
 * the one that would have caught it on the first run.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TABLE_COLUMNS,
  orderRow,
  positionRow,
  utcStamp,
} from "../lib/engine/persist";
import type { Position } from "../lib/types";

const openPosition: Position = {
  id: "DK-142233-004",
  underlying: "NIFTY",
  token: "43219",
  trading_symbol: "NIFTY04AUG2624350CE",
  option_type: "CE",
  strike: 24350,
  side: "BUY",
  quantity: 150,
  lots: 2,
  lot_size: 75,
  avg_price: 118.5,
  ltp: 131.2,
  stop_loss: 88.9,
  target: 172.4,
  unrealised_pnl: 1905,
  realised_pnl: 0,
  pnl_pct: 10.72,
  protocol: "ALPHA",
  opened_at: "2026-08-04T04:52:33",
  closed_at: null,
  exit_price: null,
  exit_reason: null,
  status: "OPEN",
  mode: "paper",
};

const closedPosition: Position = {
  ...openPosition,
  ltp: 172.4,
  unrealised_pnl: 0,
  realised_pnl: 8085,
  pnl_pct: 45.48,
  exit_price: 172.4,
  exit_reason: "TARGET",
  closed_at: "2026-08-04T06:11:02",
  status: "CLOSED",
};

/* ------------------------------------------------------------ column parity */

test("every mapped position field is a real positions column", () => {
  const allowed = new Set(TABLE_COLUMNS.positions);
  for (const key of Object.keys(positionRow(openPosition))) {
    assert.ok(allowed.has(key), `positions has no column '${key}'`);
  }
});

test("every mapped order field is a real orders column", () => {
  const allowed = new Set(TABLE_COLUMNS.orders);
  const row = orderRow({
    position: openPosition,
    transactionType: "BUY",
    quantity: 150,
    lots: 2,
    fillPrice: 118.5,
    status: "ACCEPTED",
  });
  for (const key of Object.keys(row)) {
    assert.ok(allowed.has(key), `orders has no column '${key}'`);
  }
});

test("the ledger's own id is mapped, not passed through as a primary key", () => {
  const row = positionRow(openPosition) as Record<string, unknown>;
  // `id` is an identity bigint on the table; sending "DK-142233-004" for it is
  // what made PostgREST refuse the whole batch.
  assert.equal("id" in row, false);
  assert.equal(row.ledger_id, "DK-142233-004");
});

/* ---------------------------------------------------------------- positions */

test("an open position maps with its live marks and no exit", () => {
  const row = positionRow(openPosition);
  assert.equal(row.status, "OPEN");
  assert.equal(row.trading_symbol, "NIFTY04AUG2624350CE");
  assert.equal(row.quantity, 150);
  assert.equal(row.lots, 2);
  assert.equal(row.avg_price, 118.5);
  assert.equal(row.ltp, 131.2);
  assert.equal(row.unrealised_pnl, 1905);
  assert.equal(row.realised_pnl, 0);
  assert.equal(row.pnl_pct, 10.72);
  assert.equal(row.exit_price, null);
  assert.equal(row.closed_at, null);
});

test("a closed position carries the exit that closed it", () => {
  const row = positionRow(closedPosition);
  assert.equal(row.status, "CLOSED");
  assert.equal(row.exit_price, 172.4);
  assert.equal(row.exit_reason, "TARGET");
  assert.equal(row.realised_pnl, 8085);
  assert.equal(row.closed_at, "2026-08-04T06:11:02Z");
});

test("the open time is the same on every checkpoint, so upserts collapse", () => {
  // The trade key is built from it: a mark-to-market write that moved this
  // would append a new row for every minute a position stayed open.
  assert.equal(positionRow(openPosition).opened_at, positionRow(closedPosition).opened_at);
});

/* --------------------------------------------------------------- timestamps */

test("bare engine stamps are marked as the UTC they already are", () => {
  assert.equal(utcStamp("2026-08-04T04:52:33"), "2026-08-04T04:52:33Z");
});

test("stamps that already carry a zone are left alone", () => {
  assert.equal(utcStamp("2026-08-04T10:22:33+05:30"), "2026-08-04T10:22:33+05:30");
  assert.equal(utcStamp("2026-08-04T04:52:33Z"), "2026-08-04T04:52:33Z");
});

test("an absent stamp stays absent", () => {
  assert.equal(utcStamp(null), null);
  assert.equal(utcStamp(undefined), null);
  assert.equal(utcStamp(""), null);
});

/* ------------------------------------------------------------------ orders */

test("a rejected live exit is recorded with no fill", () => {
  const row = orderRow({
    position: openPosition,
    transactionType: "SELL",
    quantity: 150,
    lots: 2,
    status: "REJECTED",
    message: "STOP_LOSS: insufficient margin",
  });
  assert.equal(row.status, "REJECTED");
  assert.equal(row.transaction_type, "SELL");
  assert.equal(row.fill_price, null);
  assert.equal(row.broker_order_id, null);
  assert.equal(row.ledger_id, "DK-142233-004");
  assert.match(row.message ?? "", /insufficient margin/);
});

test("a filled entry carries the broker's order id and the price it got", () => {
  const row = orderRow({
    position: openPosition,
    transactionType: "BUY",
    quantity: 150,
    lots: 2,
    fillPrice: 118.5,
    status: "ACCEPTED",
    brokerOrderId: "250804000123456",
    message: "ENTRY ALPHA",
  });
  assert.equal(row.status, "ACCEPTED");
  assert.equal(row.order_type, "MARKET");
  // A market order has no limit price — quoting one would invent a fact.
  assert.equal(row.price, null);
  assert.equal(row.fill_price, 118.5);
  assert.equal(row.broker_order_id, "250804000123456");
  assert.equal(row.lot_size, 75);
  assert.equal(row.protocol, "ALPHA");
});

test("a scale-out is an order for the lots it actually took off", () => {
  const row = orderRow({
    position: openPosition,
    transactionType: "SELL",
    quantity: 75,
    lots: 1,
    fillPrice: 150.25,
    status: "ACCEPTED",
    message: "TP1",
  });
  assert.equal(row.quantity, 75);
  assert.equal(row.lots, 1);
  assert.equal(row.fill_price, 150.25);
});
