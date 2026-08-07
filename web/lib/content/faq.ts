export interface FaqItem {
  slug: string;
  question: string;
  /** One or more paragraphs — kept as an array so the accordion can render real spacing, not one wall of text. */
  answer: string[];
  category: string;
  keywords: string[];
}

export interface FaqCategory {
  slug: string;
  label: string;
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  { slug: "strategy", label: "Strategy (DKMS)" },
  { slug: "trading", label: "Paper trading" },
  { slug: "risk", label: "Risk & sizing" },
  { slug: "data", label: "Data & brokers" },
  { slug: "mobile", label: "Mobile companion" },
];

export const FAQS: FaqItem[] = [
  {
    slug: "what-is-dkms",
    category: "strategy",
    question: "What is DKMS?",
    answer: [
      "DKMS — the DeltaK Matrix Strategy — reads an index's option chain rather than its raw price action. Every tick it builds two structures: COA (Chain of Aegis) walls, the highest-open-interest put strike below spot (Aegis, support) and call strike above spot (Zenith, resistance); and an RRG (Relative Rotation Graph) reading of each strike's own relative-strength trend against the index.",
      "Those two structures classify the market into a protocol — ALPHA (spot pinned near a wall), BETA (a dip bought into support), or GAMMA (a rally sold into resistance) — which is what the terminal actually trades against, not the underlying's price alone.",
    ],
    keywords: ["dkms", "deltak matrix strategy", "what is deltak"],
  },
  {
    slug: "aegis-zenith-walls",
    category: "strategy",
    question: "What are the Aegis and Zenith walls?",
    answer: [
      "Aegis is the strike below spot carrying the highest put open interest — where option writers have committed the most margin to defend a floor. Zenith is the mirror on the call side above spot — the strike writers are defending as a ceiling.",
      "COA 1.0 is the static daily read of both; COA 2.0 tracks live ΔOI intraday, so a wall that's genuinely shifting (not just sitting still) shows up before end of day.",
    ],
    keywords: ["aegis", "zenith", "coa", "wall", "open interest"],
  },
  {
    slug: "protocols",
    category: "strategy",
    question: "What do ALPHA, BETA and GAMMA mean?",
    answer: [
      "They're the three tradeable read-outs of the wall/RRG structure above. ALPHA fires when spot is pinned near a wall and the RRG rotation agrees. BETA is a dip being bought back into support. GAMMA is a rally being sold back into resistance. A fourth internal state, DELTA, means none of the three conditions are met — no trade.",
      "Every entry is also subject to the Zero-OTM rule: positions are always a real, 2nd-or-3rd-strike-in-the-money option, never a cheap out-of-the-money one — the thesis is conviction that a wall holds or breaks, not a volatility lottery ticket.",
    ],
    keywords: ["alpha", "beta", "gamma", "protocol", "zero-otm", "zero otm rule"],
  },
  {
    slug: "rrg-quadrants",
    category: "strategy",
    question: "What is the RRG rotation and what do the quadrants mean?",
    answer: [
      "RRG (Relative Rotation Graph) plots each strike's relative strength and momentum against the index into four quadrants: Leading, Weakening, Lagging, and Improving. It's the same idiom sector-rotation charts use, applied per-strike instead of per-sector.",
      "The live engine only arms entries from Leading or Improving nodes — a strike already rotating into Lagging or Weakening doesn't get treated as actionable, even if the wall/protocol read otherwise qualifies.",
    ],
    keywords: ["rrg", "relative rotation graph", "quadrant", "leading", "lagging"],
  },
  {
    slug: "limit-entry-mechanics",
    category: "strategy",
    question: "Exactly how does the limit-entry order work?",
    answer: [
      "The moment a signal qualifies, Autopilot does not pay the live offer. It quotes entry_mid × (1 − 3.0%) — 3.0% below the contract's current mid-price — and places that as a resting limit order, visible in the Trade Book's Open tab as an amber PENDING card with the limit price, the reference price it was quoted against, and a live countdown.",
      "That order waits up to 900 seconds (15 minutes). It fills only if the contract's own price genuinely trades down to the quoted level within that window — a wick touching it isn't enough on its own, the market has to actually trade through. If the window elapses first, the order expires unfilled: no trade, not a worse trade.",
      "Sizing is deliberately computed at fill time, off the price the order actually filled at, not the price it was quoted against — a limit order's whole point is a better entry than the reference it was placed against, so the position size has to be based on what was really paid.",
      "This isn't a cosmetic tweak. An 18-month walk-forward backtest found the raw wall-shift entry signal alone carries close to zero directional edge — but a consistently better fill price, independent of direction, turned a losing setup into a positive-expectancy one when combined with thesis tracking below. 3.0% is not an arbitrary number: it's the smallest discount that cleared positive out-of-sample expectancy at 95% confidence in that backtest, stress-tested against both a wider adverse-spread assumption and a stricter 'must trade meaningfully through the price' fill requirement.",
    ],
    keywords: ["limit entry", "pending order", "autopilot", "discount", "fill price"],
  },
  {
    slug: "thesis-tracking",
    category: "strategy",
    question: "What is thesis tracking / thesis-exit, and why does it matter?",
    answer: [
      "Every position is opened because a specific read was true at that moment — a protocol classification (ALPHA, BETA or GAMMA) plus, for ALPHA specifically, spot sitting near the wall the trade is anchored to. Thesis tracking means the engine keeps re-checking that exact same read, every tick, for as long as the position stays open — not just at entry.",
      "The moment that read stops being true — the protocol classification flips away from what was bought, or an ALPHA position's spot drifts away from its anchor wall — thesis-exit closes the position immediately (or, for an order still resting unfilled, cancels it outright) rather than waiting for price to travel the full distance to the stop-loss.",
      "This targets a specific, diagnosed pattern in the original signal: winners resolved in a median of about one 5-minute bar, while losers dragged on for a median of roughly thirteen bars before the (much wider) stop-loss finally caught them. Thesis-exit cuts that drag short without touching the stop or target themselves — both stay fully active as the backstop. In the backtest, roughly three out of every four trades exit this way, at a small but consistently positive mean return — it functions as an early, thesis-aware discipline layer, not a replacement for risk management.",
      "Thesis-exit applies to every open position identically, regardless of whether it was opened manually or by Autopilot, and whether it filled marketable or through a resting limit order.",
    ],
    keywords: ["thesis exit", "thesis tracking", "thesis broken", "invalidation", "exit reason"],
  },
  {
    slug: "backtest-validation",
    category: "strategy",
    question: "Has this strategy actually been backtested?",
    answer: [
      "Yes, at length, and the honest version of the story is not flattering to the first draft. An 18-month walk-forward study (five indexes, a strict train/validate/test split, real statutory charges and a swept bid-ask assumption) found the raw wall-shift entry signal on its own carries essentially no directional edge — it lost money consistently across every fold, and no amount of stop/target/window tuning fixed that.",
      "A defined-risk seller-side (credit-spread) alternative was tested too, on the theory that DKMS's own stated philosophy is an option seller's, not a buyer's — that also came back with no robust edge, and worse behaviour on some indexes.",
      "What did hold up on repeated, independent re-runs was execution quality, not signal re-tuning: the exact same unchanged signal, run once with only the limit-entry and thesis-exit mechanics above turned on, moved from roughly 40% win rate and a real loss to 52%+ win rate and a positive expectancy of about +0.05R per trade — with the held-out test fold (the one no parameter selection ever touched) coming back stronger than the training fold, not weaker, which is the opposite of an overfit result.",
      "The current shipped configuration backtests to an annualised Sharpe ratio of roughly 3.3 and a maximum drawdown of about −44% on real position sizing, after correcting an earlier sizing mistake that let risk-per-trade compound unchecked (see the risk-sizing question below).",
    ],
    keywords: ["backtest", "walk forward", "sharpe", "drawdown", "expectancy", "win rate"],
  },
  {
    slug: "manual-vs-autopilot",
    category: "trading",
    question: "What's the difference between Manual and Autopilot mode?",
    answer: [
      "Manual mode surfaces an actionable signal and waits for an explicit Execute click — nothing fires on its own. Autopilot fires (or, when limit entry is enabled, places a resting order) the instant a signal qualifies, without waiting for a click.",
      "Every risk guard — stop-loss, target, thesis-exit, daylight rest, portfolio-risk and position-count ceilings — applies identically in both modes. The only thing the mode switch changes is who presses go.",
    ],
    keywords: ["manual mode", "autopilot", "execute"],
  },
  {
    slug: "is-this-real-money",
    category: "trading",
    question: "Is this real money, or paper trading?",
    answer: [
      "Paper only. The terminal simulates every fill against live market data — real prices, real spreads, real statutory charges applied to the paper ledger — but no order is ever routed to a broker. There is currently no live-trading capability anywhere in the app.",
      "The paper wallet starts at ₹1,00,000 and is fully resettable from the account menu at any time.",
    ],
    keywords: ["paper trading", "real money", "live trading", "simulated"],
  },
  {
    slug: "daylight-rest",
    category: "trading",
    question: "What is Daylight Rest?",
    answer: [
      "A fixed intraday cutoff, in the afternoon IST session, past which the engine stops opening new positions and closes anything still open. It exists so a position never rides unmanaged into the last, thinnest minutes of the session.",
      "A position that closes for this reason is logged with a DAYLIGHT_REST exit reason in the risk event log and the Trade Book, distinct from a stop, a target, or a thesis-exit.",
    ],
    keywords: ["daylight rest", "session close", "exit reason"],
  },
  {
    slug: "risk-sizing",
    category: "risk",
    question: "How is position size decided, and why did the risk percentage change?",
    answer: [
      "Every position risks a fixed percentage of account equity at its own stop distance (riskPct), converted to a whole number of lots. A position is also capped by how much of the account's capital a single trade may occupy (maxPositionCapitalPct), and the whole book is capped by how much could be lost across every open position simultaneously if every stop hit at once (maxPortfolioRiskPct) — plus a hard ceiling on how many positions can be open together (maxConcurrentPositions).",
      "If a signal's own stop distance and lot size can't clear these floors — a large-lot, high-premium index at a small account size — it resolves to zero lots and no position opens, rather than forcing an oversized trade.",
      "riskPct itself has moved twice, each time for a distinct, measured reason. It started at 30% purely to make the most expensive index (BANKEX) affordable at all — which meant every cheaper index was carrying far more real dollar risk than it needed to. It was first cut to 15% once the account float was raised, which let the three most liquid indexes clear their own 1-lot floor without over-risking them. It was cut again to 6% once limit-entry and thesis-exit gave the strategy a real edge worth sizing carefully — a direct sweep found 6% is not a tradeoff against 15%, it's strictly better on both axes (higher Sharpe, shallower drawdown) down to roughly a 5% floor, below which indexes start failing to clear their own 1-lot minimum and drop out of the trade mix entirely.",
    ],
    keywords: ["risk pct", "position sizing", "lot size", "portfolio risk"],
  },
  {
    slug: "which-indexes",
    category: "data",
    question: "Which indexes does the terminal cover?",
    answer: [
      "Five: NIFTY, BANKNIFTY and FINNIFTY (NSE), and SENSEX and BANKEX (BSE). Every panel — the option chain, RRG, walls and signal engine — runs independently per index; switching the focused index in the header switches which one the whole board is reading.",
    ],
    keywords: ["nifty", "banknifty", "finnifty", "sensex", "bankex", "indexes"],
  },
  {
    slug: "which-brokers",
    category: "data",
    question: "Which brokers can I connect?",
    answer: [
      "Dhan (its own Data API) and Angel One (SmartAPI). Both feed the same option-chain, walls, RRG and signal engine — the broker choice only changes where market data and the paper fill simulation source their quotes from, not what DKMS itself computes.",
      "Sign-in needs a client ID, PIN and a fresh six-digit TOTP for whichever broker you pick, exactly as the broker's own app would ask.",
    ],
    keywords: ["dhan", "angel one", "smartapi", "broker", "login"],
  },
  {
    slug: "credentials-stored",
    category: "data",
    question: "Are my broker credentials stored?",
    answer: [
      "No. The client ID, PIN and TOTP are relayed straight to the broker to authenticate and are never written to disk. The session token the broker issues back is what the terminal holds onto (encrypted, in an httpOnly cookie) for the length of the session — the same thing the broker's own web login would leave you with.",
    ],
    keywords: ["credentials", "security", "totp", "pin", "session"],
  },
  {
    slug: "mobile-companion-what",
    category: "mobile",
    question: "What is the mobile companion?",
    answer: [
      "A read-only view of the terminal's live signal state and trade book on a paired phone — it never places, cancels, or modifies anything, it only watches whatever the desktop tab is doing. Useful for keeping an eye on an open position or a resting order without the desktop in front of you.",
    ],
    keywords: ["mobile companion", "phone", "read only", "pair"],
  },
  {
    slug: "mobile-companion-pair",
    category: "mobile",
    question: "How do I pair my phone?",
    answer: [
      "From the desktop terminal's account menu, mint a QR code and scan it with your phone's camera — no app install, no separate account. A phone stays paired for up to 30 days or until it's removed from the desktop's device list; up to three phones can be paired to one account at once.",
    ],
    keywords: ["pairing", "qr code", "pair phone"],
  },
  {
    slug: "mobile-companion-freshness",
    category: "mobile",
    question: "Why does the mobile companion sometimes show slightly stale numbers?",
    answer: [
      "The desktop tab pushes its state to a paired phone on a throttle (a few seconds), not on every tick — a phone doesn't need once-a-second freshness the way the live board does. If the desktop tab itself closes, the phone falls back to the last saved checkpoint instead of freezing on numbers with no source at all; the companion always labels which of the two it's currently showing.",
    ],
    keywords: ["mobile stale", "checkpoint", "live push"],
  },
  {
    slug: "investment-advice",
    category: "trading",
    question: "Is anything on this site investment advice?",
    answer: [
      "No. DeltaK, DKMS, the terminal, and everything in this FAQ are educational and illustrative. Options trading carries substantial risk of loss, every fill in the terminal is simulated, and nothing here should be read as a recommendation to trade any specific instrument.",
    ],
    keywords: ["investment advice", "disclaimer", "risk warning"],
  },
];
