/**
 * `lib/server/crypto.ts` — kept out of `server-only` specifically so this can
 * hold it to its own round trip without a Next.js runtime.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";

import { decryptSecret, encryptSecret, encryptionConfigured } from "../lib/server/crypto";

// `key()` reads DK_SESSION_ENC_KEY fresh on every call rather than caching it
// at import time, so it can be set here rather than needing a real deployment
// secret for the test to run against.
process.env.DK_SESSION_ENC_KEY = randomBytes(32).toString("base64");

test("a secret decrypts back to exactly what was encrypted", () => {
  const enc = encryptSecret("eyJhbGciOiJIUzI1NiJ9.not-a-real-jwt.signature");
  assert.equal(decryptSecret(enc), "eyJhbGciOiJIUzI1NiJ9.not-a-real-jwt.signature");
  // Ciphertext is not the plaintext sitting in a different encoding.
  assert.notEqual(enc.ciphertext, Buffer.from("eyJhbGciOiJIUzI1NiJ9.not-a-real-jwt.signature").toString("base64"));
});

test("two encryptions of the same secret produce different ciphertext", () => {
  // A fresh random IV every call — so a stored row never reveals that two
  // accounts (or two logins) share a token by comparing ciphertext.
  const a = encryptSecret("same-token");
  const b = encryptSecret("same-token");
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.notEqual(a.iv, b.iv);
  assert.equal(decryptSecret(a), "same-token");
  assert.equal(decryptSecret(b), "same-token");
});

test("a tampered tag fails closed rather than returning garbage", () => {
  const enc = encryptSecret("a-live-trading-jwt");
  assert.throws(() => decryptSecret({ ...enc, tag: encryptSecret("x").tag }));
});

test("encryptionConfigured is false without a usable key", () => {
  const saved = process.env.DK_SESSION_ENC_KEY;
  try {
    process.env.DK_SESSION_ENC_KEY = "";
    assert.equal(encryptionConfigured(), false);
    process.env.DK_SESSION_ENC_KEY = "too-short";
    assert.equal(encryptionConfigured(), false);
    process.env.DK_SESSION_ENC_KEY = saved;
    assert.equal(encryptionConfigured(), true);
  } finally {
    process.env.DK_SESSION_ENC_KEY = saved;
  }
});
