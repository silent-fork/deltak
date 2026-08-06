/**
 * The broker/stored reconciliation rule.
 *
 * This exists because of a real regression: a manually-entered email survived
 * the edit, then vanished about fifteen minutes later. `getProfile` reports no
 * email for an account that has none on file, and the profile write pushed that
 * null straight into the row the operator had just filled in. The tests that
 * matter here are the null ones.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeProfile, type StoredContact } from "../lib/profileMerge";
import type { UserProfile } from "../lib/types";

const broker = (over: Partial<UserProfile> = {}): UserProfile => ({
  client_code: "A1045550",
  name: "AKSHAT JAIN",
  email: null,
  mobile_no: null,
  broker: null,
  exchanges: ["NSE_FO"],
  products: ["MARGIN"],
  broker_last_login: null,
  ...over,
});

const stored = (over: Partial<StoredContact> = {}): StoredContact => ({
  name: "AKSHAT JAIN",
  email: "akshatjn@outlook.com",
  mobile_no: "9997733537",
  broker: "Angel One",
  exchanges: ["NSE_FO", "BSE_CM"],
  products: ["MARGIN", "MIS"],
  broker_last_login: "2026-08-01 10:42",
  paper_capital: 23_460.13,
  paper_charges: 34.47,
  paper_realised_pnl: -1_505.4,
  ...over,
});

test("a contact the broker does not report keeps the stored value", () => {
  const merged = mergeProfile(broker(), stored());
  assert.equal(merged.email, "akshatjn@outlook.com");
  assert.equal(merged.mobile_no, "9997733537");
});

test("the broker wins wherever it actually reports something", () => {
  const merged = mergeProfile(
    broker({ email: "kyc@angelone.in", mobile_no: "9812345678" }),
    stored(),
  );
  assert.equal(merged.email, "kyc@angelone.in");
  assert.equal(merged.mobile_no, "9812345678");
});

test("a cleared contact stays cleared when the broker is also silent", () => {
  // The operator emptied the field on purpose; nothing should resurrect it.
  const merged = mergeProfile(broker(), stored({ email: null, mobile_no: null }));
  assert.equal(merged.email, null);
  assert.equal(merged.mobile_no, null);
});

test("nothing stored yet leaves the broker profile untouched", () => {
  const raw = broker({ email: "kyc@angelone.in" });
  assert.deepEqual(mergeProfile(raw, null), raw);
});

test("empty segment and product lists fall back to the stored ones", () => {
  const merged = mergeProfile(broker({ exchanges: [], products: [] }), stored());
  assert.deepEqual(merged.exchanges, ["NSE_FO", "BSE_CM"]);
  assert.deepEqual(merged.products, ["MARGIN", "MIS"]);
});

test("a reported segment list replaces the stored one rather than merging", () => {
  // A segment disabled at the broker must disappear here, not linger forever.
  const merged = mergeProfile(broker({ exchanges: ["NSE_FO"] }), stored());
  assert.deepEqual(merged.exchanges, ["NSE_FO"]);
});

test("name and broker survive a silent getProfile", () => {
  const merged = mergeProfile(broker({ name: null }), stored());
  assert.equal(merged.name, "AKSHAT JAIN");
  assert.equal(merged.broker, "Angel One");
  assert.equal(merged.broker_last_login, "2026-08-01 10:42");
});

test("the client code always comes from the live session, never the row", () => {
  const merged = mergeProfile(broker({ client_code: "B2000001" }), stored());
  assert.equal(merged.client_code, "B2000001");
});

/**
 * The regression this file's own header warns about, for the wallet fields
 * instead of contact ones: `getProfile` has no concept of the paper wallet,
 * so `broker` never carries `paper_capital`/`paper_charges`/`paper_realised_pnl`
 * at all — not even `null`, the key is simply absent. A merge that only
 * special-cased the seven contact fields (as this one originally did) spread
 * `broker` as its base and silently dropped the wallet checkpoint from the
 * result, which meant `useEngine.ts`'s `wallet?.paper_capital != null` gate
 * always saw `undefined` and skipped `Ledger.restoreWallet` — on every
 * session check, forever, regardless of what the row actually held.
 */
test("the paper wallet checkpoint always comes from the stored row — the broker never reports it", () => {
  const merged = mergeProfile(broker(), stored());
  assert.equal(merged.paper_capital, 23_460.13);
  assert.equal(merged.paper_charges, 34.47);
  assert.equal(merged.paper_realised_pnl, -1_505.4);
});

test("no stored row yet leaves the wallet checkpoint absent, not defaulted to zero", () => {
  const merged = mergeProfile(broker(), null);
  assert.equal(merged.paper_capital, undefined);
  assert.equal(merged.paper_charges, undefined);
  assert.equal(merged.paper_realised_pnl, undefined);
});

test("a stored row with a genuinely null checkpoint (never traded) stays null, not undefined", () => {
  const merged = mergeProfile(
    broker(),
    stored({ paper_capital: null, paper_charges: null, paper_realised_pnl: null }),
  );
  assert.equal(merged.paper_capital, null);
  assert.equal(merged.paper_charges, null);
  assert.equal(merged.paper_realised_pnl, null);
});
