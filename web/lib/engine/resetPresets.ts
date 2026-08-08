/**
 * Starting-balance choices for "reset paper wallet" (see `UserPill`'s reset
 * panel). A smaller float needs a much higher `riskPct` to clear the same
 * per-index 1-lot floors the default 6% was tuned against at Rs 1,00,000 —
 * see `DEFAULT_CONFIG.riskPct`'s own doc comment for why that floor exists
 * — so each capital tier carries its own risk percentage rather than
 * leaving risk sizing mismatched against whatever balance gets picked.
 */
export const RESET_PRESETS = [
  { capital: 25_000, riskPct: 60 },
  { capital: 50_000, riskPct: 30 },
  { capital: 100_000, riskPct: 6 },
] as const;
