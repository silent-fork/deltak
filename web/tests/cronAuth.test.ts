import assert from "node:assert/strict";
import { test } from "node:test";

import { isCronAuthorised } from "../lib/server/cronAuth";

test("no secret configured means the route is off, not open", () => {
  assert.equal(isCronAuthorised("Bearer anything", undefined), false);
  assert.equal(isCronAuthorised(null, undefined), false);
  assert.equal(isCronAuthorised("Bearer ", ""), false);
});

test("only the exact bearer header matches", () => {
  assert.equal(isCronAuthorised("Bearer s3cr3t", "s3cr3t"), true);
  assert.equal(isCronAuthorised("Bearer wrong", "s3cr3t"), false);
  assert.equal(isCronAuthorised("s3cr3t", "s3cr3t"), false); // missing "Bearer "
  assert.equal(isCronAuthorised(null, "s3cr3t"), false);
});
