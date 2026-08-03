export type GlossaryCategory =
  | "Options Basics"
  | "The Greeks"
  | "Indian F&O Rules"
  | "Reading the Market"
  | "DeltaK Terminology";

export interface GlossaryTerm {
  slug: string;
  term: string;
  category: GlossaryCategory;
  shortDef: string;
  body: string[];
  related: string[];
  keywords: string[];
}

/**
 * The wiki's dictionary layer — deliberately including DeltaK's own coined
 * terms (Aegis, Zenith, Quantum Horizon, COA, RRG, Zero-OTM, DKMS) as first-
 * class entries alongside standard exchange terminology. Someone who saw
 * "Aegis" inside the terminal and searched for it should land on a real,
 * complete definition, not a dead end.
 */
export const GLOSSARY: GlossaryTerm[] = [
  {
    slug: "premium",
    term: "Premium",
    category: "Options Basics",
    shortDef: "The price paid by a buyer, and received by a seller, for one option contract.",
    body: [
      "Premium is the only thing a long option position risks and the only thing a short option position collects upfront. It's made of two components: intrinsic value (what the option would be worth if exercised right now) and time value (everything else — the market's estimate of how much that intrinsic value could still change before expiry).",
      "Time value decays toward zero as expiry approaches (see Theta), which is why the same strike's premium falls through the week even if spot hasn't moved.",
    ],
    related: ["strike-price", "theta", "implied-volatility-iv"],
    keywords: ["option premium meaning", "options premium india", "what is premium in options trading"],
  },
  {
    slug: "strike-price",
    term: "Strike Price",
    category: "Options Basics",
    shortDef: "The fixed price at which an option's buyer can buy (call) or sell (put) the underlying.",
    body: [
      "Every listed option is defined by three things: the underlying, the expiry, and the strike price. NIFTY options list strikes in steps of 50 points, BANKNIFTY in steps of 100, FINNIFTY in steps of 50 — the exchange sets the step, not the trader.",
      "Where spot sits relative to a given strike is what determines that option's moneyness — at, in, or out of the money.",
    ],
    related: ["at-the-money-atm", "in-the-money-itm", "moneyness"],
    keywords: ["strike price meaning", "option strike price india", "nifty strike interval"],
  },
  {
    slug: "at-the-money-atm",
    term: "At-The-Money (ATM)",
    category: "Options Basics",
    shortDef: "The strike closest to the current spot price — carries the most time value on the chain.",
    body: [
      "The ATM strike has the least intrinsic value of any strike (technically none) but the richest time value, because it's the strike whose fate is least certain — spot could finish above or below it. That's why ATM straddles are the standard way to price the market's expected move: the combined ATM call and put premium is the market's own bet on how far spot travels before expiry.",
      "DeltaK's Quantum Horizon line is drawn at exactly this point on a live chain — the ATM boundary separating in-the-money calls from in-the-money puts, redrawn tick by tick as spot moves.",
    ],
    related: ["quantum-horizon", "in-the-money-itm", "out-of-the-money-otm"],
    keywords: ["atm option meaning", "at the money options india", "atm strike nifty"],
  },
  {
    slug: "in-the-money-itm",
    term: "In-The-Money (ITM)",
    category: "Options Basics",
    shortDef: "A call with a strike below spot, or a put with a strike above spot — has real intrinsic value.",
    body: [
      "An ITM option's premium is at least its intrinsic value, plus whatever time value the market still assigns it. Deep-ITM options behave closest to the underlying itself — high delta, low time decay as a share of premium — which is exactly why DeltaK's Zero-OTM rule restricts long entries to the 2nd or 3rd deepest ITM strike rather than the cheaper, faster-decaying OTM chain.",
    ],
    related: ["out-of-the-money-otm", "zero-otm-rule", "delta-greek"],
    keywords: ["itm option meaning", "in the money options india", "deep itm options strategy"],
  },
  {
    slug: "out-of-the-money-otm",
    term: "Out-of-the-Money (OTM)",
    category: "Options Basics",
    shortDef: "A call with a strike above spot, or a put with a strike below spot — pure time value, no intrinsic value.",
    body: [
      "An OTM option is worth exactly zero at expiry unless spot crosses the strike first. That makes OTM premium cheap and its percentage returns explosive when a move does arrive — and equally why most OTM buyers lose the full premium most of the time. It's the honest reason instruments like far-OTM weekly calls get sold as \"lottery tickets\" in trading forums.",
    ],
    related: ["in-the-money-itm", "moneyness", "theta"],
    keywords: ["otm option meaning", "out of the money options india", "otm option buying risk"],
  },
  {
    slug: "moneyness",
    term: "Moneyness",
    category: "Options Basics",
    shortDef: "Where a strike sits relative to spot right now — ITM, ATM, or OTM.",
    body: [
      "Moneyness isn't fixed at entry; it moves every tick as spot moves. A call bought OTM can finish ITM by expiry and vice versa — which is the entire reason option payoff is nonlinear and worth diagramming rather than just quoting a single number.",
    ],
    related: ["at-the-money-atm", "in-the-money-itm", "out-of-the-money-otm"],
    keywords: ["moneyness of options", "moneyness meaning", "option moneyness explained"],
  },
  {
    slug: "breakeven-point",
    term: "Breakeven Point",
    category: "Options Basics",
    shortDef: "The underlying price at expiry where a position's total P&L is exactly zero.",
    body: [
      "A single long call's breakeven is strike plus premium paid; a single long put's is strike minus premium paid. Multi-leg strategies can have two breakevens (a straddle, a strangle) or one (a spread) — every strategy page on this wiki marks its breakeven(s) directly on the payoff diagram rather than making you derive them by hand.",
    ],
    related: ["premium", "strike-price"],
    keywords: ["breakeven point options", "options breakeven calculation", "straddle breakeven"],
  },
  {
    slug: "lot-size",
    term: "Lot Size",
    category: "Options Basics",
    shortDef: "The fixed number of underlying units bundled into one F&O contract — set by the exchange, not the trader.",
    body: [
      "Indian index options can't be bought or sold per-share the way equity delivery can — every order is in whole lots. The exchange periodically revises lot sizes to keep a contract's notional value inside SEBI's mandated band, which is why lot sizes have changed more than once for NIFTY, BANKNIFTY and FINNIFTY over the years. Always check the current lot size before sizing a position; a stale number from an old screenshot or an outdated blog post is a real way to over- or under-leverage a trade.",
    ],
    related: ["strike-price"],
    keywords: ["nifty lot size", "banknifty lot size", "fno lot size india"],
  },
  {
    slug: "option-chain",
    term: "Option Chain",
    category: "Options Basics",
    shortDef: "The full grid of calls and puts across every listed strike for one underlying and expiry.",
    body: [
      "A standard chain lists strike, premium, open interest, volume and implied volatility for calls on one side and puts on the other. DeltaK's own 4-Quadrant Option Chain reads it a step further — every strike carries its own RRG quadrant and RS-Ratio alongside the raw numbers, so the ladder shows which strikes are actually rotating, not just which are liquid.",
    ],
    related: ["open-interest-oi", "rrg-momentum", "strike-price"],
    keywords: ["option chain meaning", "nifty option chain explained", "how to read option chain"],
  },
  {
    slug: "delta-greek",
    term: "Delta (the Options Greek)",
    category: "The Greeks",
    shortDef: "How much an option's premium moves for a ₹1 move in the underlying — not to be confused with DeltaK, the trading terminal.",
    body: [
      "Delta runs from 0 to 1 for calls and 0 to −1 for puts, and roughly tracks an option's probability of finishing ITM. A deep-ITM option's delta approaches 1 (moves almost point-for-point with spot); a far-OTM option's delta approaches 0 (barely moves at all).",
      "It's a coincidence of naming, not a connection: this page is about the Greek. DeltaK, this site's own trading terminal, is named for a different idea — the wall migration and rotation its engine reads, not the options Greek.",
    ],
    related: ["gamma-greek", "in-the-money-itm"],
    keywords: ["delta options greek", "options delta explained", "delta hedging basics"],
  },
  {
    slug: "theta",
    term: "Theta",
    category: "The Greeks",
    shortDef: "The daily erosion of an option's time value as expiry approaches — always working against the option buyer.",
    body: [
      "Theta is negative for long options and positive for short options: every day that passes, all else equal, a long option is worth a little less and a short option owes a little less. Decay isn't linear — it accelerates sharply in the final few sessions before a weekly expiry, which is exactly why holding long premium into expiry week is one of the most common ways a directionally-right trade still loses money.",
    ],
    related: ["premium", "implied-volatility-iv"],
    keywords: ["theta decay options", "theta meaning options india", "time decay options strategy"],
  },
  {
    slug: "gamma-greek",
    term: "Gamma",
    category: "The Greeks",
    shortDef: "How fast delta itself changes as the underlying moves — the acceleration behind the acceleration.",
    body: [
      "Gamma is highest for at-the-money options close to expiry, which is why a short ATM straddle held into the final session can swing violently on a move that would barely register a session earlier. High gamma cuts both ways: it's what makes a long option's payoff curve bend upward so favorably, and what makes a short option's exposure so much harder to sit through near expiry.",
    ],
    related: ["delta-greek", "short-straddle"],
    keywords: ["gamma options greek", "gamma risk near expiry", "options gamma explained india"],
  },
  {
    slug: "vega",
    term: "Vega",
    category: "The Greeks",
    shortDef: "How much an option's premium changes for a one-point move in implied volatility.",
    body: [
      "Long options have positive vega (they gain value as IV rises) and short options have negative vega (they gain as IV falls). This is the mechanism behind the classic \"IV crush\" — a long straddle bought ahead of an event can lose money even on a correctly-timed move, because IV collapses the moment the uncertainty resolves, faster than the underlying's move can add value back.",
    ],
    related: ["implied-volatility-iv", "long-straddle"],
    keywords: ["vega options greek", "iv crush explained", "vega meaning options trading"],
  },
  {
    slug: "implied-volatility-iv",
    term: "Implied Volatility (IV)",
    category: "The Greeks",
    shortDef: "The market's forward-looking estimate of how much the underlying will move, backed out of current option prices.",
    body: [
      "IV isn't a forecast of direction, only magnitude — it rises ahead of known catalysts (results, policy events, budget day) and typically falls sharply once the event passes, regardless of which way the market moved. High IV means richer premium on both sides of the chain: good for sellers writing straddles and strangles, expensive for buyers of straight calls and puts.",
    ],
    related: ["vega", "premium", "short-straddle"],
    keywords: ["implied volatility meaning", "iv options india", "how implied volatility affects premium"],
  },
  {
    slug: "weekly-expiry",
    term: "Weekly Expiry",
    category: "Indian F&O Rules",
    shortDef: "The recurring weekly settlement date for an index's options contracts.",
    body: [
      "SEBI's rationalization of derivatives expiries requires each exchange to run only one weekly options expiry day across its own index products, rather than staggering a different weekday per index the way NSE and BSE both used to. NSE currently runs its weekly index options expiry on Tuesday; BSE (Sensex, Bankex) runs its on Thursday.",
      "Exchanges have changed this weekday assignment more than once by circular, so treat the day named here as the current convention, not a permanent fact — the exchange's own contract notes for the series you're actually trading are the authoritative source in the moment.",
    ],
    related: ["monthly-expiry", "expiry-day"],
    keywords: ["nifty weekly expiry day", "weekly expiry rule india", "options expiry day nse bse"],
  },
  {
    slug: "monthly-expiry",
    term: "Monthly Expiry",
    category: "Indian F&O Rules",
    shortDef: "The last weekly expiry of the calendar month for a given index — carries the deepest liquidity and open interest.",
    body: [
      "Monthly expiry contracts accumulate open interest across the whole month rather than the single week a weekly contract lives for, which is why monthly OI levels are read as the more durable support/resistance signal — the walls DeltaK's COA engine weighs most heavily aren't the ones that reset every Tuesday or Thursday.",
    ],
    related: ["weekly-expiry", "open-interest-oi", "coa-matrix"],
    keywords: ["nifty monthly expiry", "monthly vs weekly expiry options", "monthly expiry open interest"],
  },
  {
    slug: "physical-settlement",
    term: "Physical Settlement",
    category: "Indian F&O Rules",
    shortDef: "SEBI's rule that in-the-money stock F&O contracts settle by actual delivery of shares, not a cash payout.",
    body: [
      "This applies to stock options and futures, not index options — NIFTY, BANKNIFTY and FINNIFTY are cash-settled, since there's no physical NIFTY to deliver. It matters most to anyone who holds a stock option ITM into expiry without closing it: the exchange will settle it into a real delivery position (and the margin obligation that comes with one), not a simple profit or loss credited to the account.",
    ],
    related: ["monthly-expiry"],
    keywords: ["physical settlement fo india", "stock options physical settlement", "itm option expiry stock"],
  },
  {
    slug: "stt-on-options",
    term: "Securities Transaction Tax (STT) on Options",
    category: "Indian F&O Rules",
    shortDef: "A transaction tax charged on options trades, including on exercise of ITM options at expiry.",
    body: [
      "STT is levied on the sell side of an options trade, and separately — often overlooked by newer traders — on the exercise of an option that expires in-the-money, calculated on the full intrinsic value at settlement rather than just the premium. That STT-on-exercise charge has occasionally been large enough to turn a barely-ITM position into a net loss after costs, which is why closing a position manually before expiry rather than letting a thin ITM strike auto-exercise is common practice among active traders. Rates change by government notification, so check the current schedule with your broker rather than trusting a fixed number here.",
    ],
    related: ["physical-settlement"],
    keywords: ["stt on options india", "securities transaction tax options", "stt on option exercise"],
  },
  {
    slug: "span-margin",
    term: "SPAN Margin",
    category: "Indian F&O Rules",
    shortDef: "The exchange's scenario-based minimum margin requirement for a futures or short-options position.",
    body: [
      "SPAN (Standard Portfolio Analysis of Risk) stress-tests a position against a grid of plausible price and volatility moves and requires margin equal to the worst plausible one-day loss in that grid. It's why margin for undefined-risk trades like a naked short straddle is substantial and can rise sharply on a volatile day — the exchange is repricing the worst case in real time, not charging a flat rate.",
    ],
    related: ["exposure-margin", "short-straddle"],
    keywords: ["span margin explained", "span margin options selling", "margin for short straddle india"],
  },
  {
    slug: "exposure-margin",
    term: "Exposure Margin",
    category: "Indian F&O Rules",
    shortDef: "An additional margin layered on top of SPAN, covering risk SPAN's scenario grid doesn't fully capture.",
    body: [
      "Total margin blocked for an F&O position is SPAN plus exposure margin, not SPAN alone — a distinction that matters when comparing a broker's quoted margin requirement against a back-of-envelope SPAN-only estimate and finding the real number higher.",
    ],
    related: ["span-margin"],
    keywords: ["exposure margin meaning", "span vs exposure margin", "total margin options india"],
  },
  {
    slug: "circuit-limit",
    term: "Circuit Limit (Dynamic Price Band)",
    category: "Indian F&O Rules",
    shortDef: "The exchange-set price band beyond which an order simply can't be placed for that session.",
    body: [
      "Individual stock and index options carry their own dynamic price bands, recalculated through the session, separate from the underlying's own circuit filter. A strike hitting its band can freeze new orders at that price even while the underlying keeps moving — a real execution risk on illiquid far-OTM strikes during a fast move, distinct from the underlying itself hitting an upper or lower circuit.",
    ],
    related: [],
    keywords: ["circuit limit options india", "option price band nse", "dynamic price range options"],
  },
  {
    slug: "fo-ban-list",
    term: "F&O Ban List",
    category: "Indian F&O Rules",
    shortDef: "Stocks whose F&O open interest has crossed 95% of the market-wide position limit, restricted to reducing existing positions only.",
    body: [
      "A stock in ban doesn't stop trading — it stops accepting new F&O positions from anyone, exchange-wide, until open interest falls back under the threshold. It applies to individual stock F&O, not to the index contracts (NIFTY, BANKNIFTY, FINNIFTY) DeltaK trades, but it's a standard piece of Indian F&O plumbing worth knowing if a strategy here ever gets adapted to single-stock options.",
    ],
    related: [],
    keywords: ["fo ban list meaning", "stock in ban period fo", "market wide position limit india"],
  },
  {
    slug: "put-call-ratio-pcr",
    term: "Put-Call Ratio (PCR)",
    category: "Reading the Market",
    shortDef: "Total put open interest divided by total call open interest — a rough sentiment gauge, read contrarian more often than literally.",
    body: [
      "A PCR well above 1 is conventionally read as bearish sentiment building — but because a large PCR often reflects protective put buying or put writing at support rather than outright bearish conviction, it's traditionally read as a contrarian signal near its extremes rather than taken at face value. It's one input among several, never a signal on its own.",
    ],
    related: ["open-interest-oi", "max-pain"],
    keywords: ["put call ratio meaning", "pcr nifty", "how to read pcr options"],
  },
  {
    slug: "max-pain",
    term: "Max Pain",
    category: "Reading the Market",
    shortDef: "The strike at which the total value of all outstanding options (calls and puts combined) would be lowest at expiry — where option writers as a group lose the least.",
    body: [
      "The theory behind max pain is that large option writers have some influence pulling spot toward that strike into expiry, though the evidence for it as a reliable predictor is mixed at best and it should be treated as one context data point, not a target level to trade against blindly.",
    ],
    related: ["open-interest-oi", "put-call-ratio-pcr"],
    keywords: ["max pain theory options", "max pain nifty expiry", "max pain calculation explained"],
  },
  {
    slug: "open-interest-oi",
    term: "Open Interest (OI)",
    category: "Reading the Market",
    shortDef: "The total number of outstanding contracts at a strike that haven't yet been closed, exercised or expired.",
    body: [
      "OI measures how many positions exist, not how many trades happened today (that's volume) — a strike can have huge OI with barely any volume on a quiet day. Reading OI alongside price direction is what separates genuine buildup from noise: see OI Buildup Matrix for how DeltaK and most active traders classify the four combinations.",
    ],
    related: ["oi-buildup-matrix", "option-chain", "coa-matrix"],
    keywords: ["open interest meaning options", "oi analysis nifty", "how to read open interest"],
  },
  {
    slug: "oi-buildup-matrix",
    term: "OI Buildup Matrix",
    category: "Reading the Market",
    shortDef: "The 2x2 reading of price direction against open-interest direction — long buildup, short buildup, short covering, long unwinding.",
    body: [
      "Price up with OI up is a long buildup — fresh, confident buying. Price down with OI up is a short buildup — fresh, confident selling. Price up with OI down is short covering — shorts closing out, not new conviction. Price down with OI down is long unwinding — longs closing out, not new selling pressure.",
      "The distinction matters because price direction alone can't tell buildup from unwind — a rally on short covering tends to fade once the covering is done, while a rally on genuine long buildup has fresh capital behind it. DeltaK's COA Matrix runs this same logic per-strike, in real time, across two OI generations rather than one end-of-day snapshot.",
    ],
    related: ["open-interest-oi", "coa-matrix"],
    keywords: ["long buildup short buildup meaning", "oi buildup analysis", "short covering vs long unwinding"],
  },
  {
    slug: "rollover",
    term: "Rollover",
    category: "Reading the Market",
    shortDef: "Closing a position in the expiring month's contract and opening the equivalent position in the next month, to keep exposure running past expiry.",
    body: [
      "Rollover percentage — how much of the expiring month's open interest has already moved to the next series — is watched in the days before monthly expiry as a rough proxy for how much conviction is carrying forward versus closing out flat.",
    ],
    related: ["monthly-expiry"],
    keywords: ["rollover meaning fo", "futures rollover explained", "nifty rollover percentage"],
  },
  {
    slug: "aegis",
    term: "Aegis",
    category: "DeltaK Terminology",
    shortDef: "DeltaK's name for the live support wall — the open-interest concentration beneath spot that price is being defended against.",
    body: [
      "Aegis isn't a fixed line drawn once; it's read fresh from where cumulative open interest is actually concentrated below spot, across two generations (COA 1.0 and 2.0 — see COA Matrix), and it migrates as writers add to it, defend it, or abandon it for a new strike. A solid Aegis is what lets DeltaK's Protocol Alpha and Beta engage a long entry at all — the moment it starts migrating instead of holding, that changes which protocol is armed.",
    ],
    related: ["zenith", "coa-matrix", "quantum-horizon"],
    keywords: ["what is aegis in options trading", "aegis support wall deltak", "aegis zenith meaning"],
  },
  {
    slug: "zenith",
    term: "Zenith",
    category: "DeltaK Terminology",
    shortDef: "DeltaK's name for the live resistance wall — the open-interest concentration above spot that a rally is being capped against.",
    body: [
      "Zenith is Aegis's mirror on the call side: the strike above spot where writers have concentrated open interest, read live rather than fixed at the start of the session. A solid Zenith is what allows a put entry under Protocol Alpha or Gamma; a migrating Zenith is read as resistance being ceded, not just tested.",
    ],
    related: ["aegis", "coa-matrix", "quantum-horizon"],
    keywords: ["what is zenith in options trading", "zenith resistance wall deltak", "aegis zenith meaning"],
  },
  {
    slug: "quantum-horizon",
    term: "Quantum Horizon",
    category: "DeltaK Terminology",
    shortDef: "DeltaK's live ITM/OTM boundary through the option chain — the at-the-money line, redrawn tick by tick as spot moves.",
    body: [
      "Everything to the left of the Quantum Horizon is in-the-money for calls; everything to the right is in-the-money for puts. It's the same ATM concept every options trader already uses, just rendered as a literal, moving line through the live chain rather than something you have to mentally locate yourself strike by strike — and the reference point every payoff diagram on this wiki is drawn against.",
    ],
    related: ["at-the-money-atm", "aegis", "zenith"],
    keywords: ["quantum horizon deltak", "atm horizon options chain", "what is quantum horizon"],
  },
  {
    slug: "coa-matrix",
    term: "COA Matrix",
    category: "DeltaK Terminology",
    shortDef: "Cumulative Open Interest Analysis — DeltaK's read of Aegis and Zenith across two OI generations at once.",
    body: [
      "COA 1.0 is the cumulative open-interest wall built up over the life of the contract; COA 2.0 is the OI generation actually being built today. Reading both together is what lets DeltaK tell an old, durable wall apart from today's writers building a fresh one at a different strike — the exact moment that shift happens is a migration event, and it's what actually re-arms which of the four DKMS protocols is live.",
    ],
    related: ["aegis", "zenith", "oi-buildup-matrix"],
    keywords: ["coa matrix deltak", "cumulative open interest analysis", "coa 1.0 coa 2.0"],
  },
  {
    slug: "rrg-momentum",
    term: "RRG Momentum",
    category: "DeltaK Terminology",
    shortDef: "DeltaK's per-strike Relative Rotation Graph — RS-Ratio against RS-Momentum, sorted into Leading, Improving, Weakening and Lagging.",
    body: [
      "Borrowed from the sector-rotation RRG charts used in equity research and applied strike-by-strike instead of sector-by-sector: every strike on the chain gets its own quadrant, live. A Lagging quadrant is read as high-decay and is a hard gate against new long entries in DeltaK regardless of what the COA walls are doing — momentum and wall structure both have to agree before a signal is actionable.",
    ],
    related: ["zero-otm-rule", "coa-matrix"],
    keywords: ["rrg relative rotation graph options", "rrg momentum deltak", "rrg quadrant trading"],
  },
  {
    slug: "zero-otm-rule",
    term: "Zero-OTM Rule",
    category: "DeltaK Terminology",
    shortDef: "DeltaK's constraint that long entries are restricted to the 2nd or 3rd deepest in-the-money strike — never ATM, never OTM.",
    body: [
      "The rule trades away the cheaper premium of an ATM or OTM strike for the slower time decay and higher delta of a strike that's already meaningfully in-the-money — a deliberate bias toward strikes that behave more like the underlying and less like a fast-decaying lottery ticket. It's a hard gate: a candidate that fails it doesn't get sized down, it doesn't get taken at all.",
    ],
    related: ["in-the-money-itm", "rrg-momentum"],
    keywords: ["zero otm rule deltak", "itm option entry rule", "deep itm options entry strategy"],
  },
  {
    slug: "dkms-protocols",
    term: "DKMS Protocols (Alpha, Beta, Gamma, Delta)",
    category: "DeltaK Terminology",
    shortDef: "The four regimes of the DeltaK Matrix Strategy — which one is armed is read live off how Aegis and Zenith are actually migrating.",
    body: [
      "Alpha (Equilibrium Range) engages when both walls are solid, buying the 2nd ITM call at Aegis and the 2nd ITM put at Zenith. Beta (Ascension Vector) arms when support is solid but resistance is migrating up, taking ITM calls on a downward micro-dip while banning put purchases outright. Gamma (Cascade Vector) is Beta's mirror on the way down — ITM puts on the cascade, calls banned outright. Delta (Volatility Trap) is what's live when both bounds are migrating at once with no clear regime: no candidate clears the gate, and the engine mutes itself by design rather than guess.",
      "No protocol is a setting anyone chooses — which one is live is a read of the market, recomputed continuously, not a preference stored anywhere.",
    ],
    related: ["aegis", "zenith", "zero-otm-rule"],
    keywords: ["dkms protocols explained", "deltak matrix strategy", "protocol alpha beta gamma delta options"],
  },
];

export function getGlossaryTerm(slug: string): GlossaryTerm | undefined {
  return GLOSSARY.find((g) => g.slug === slug);
}

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  "Options Basics",
  "The Greeks",
  "Indian F&O Rules",
  "Reading the Market",
  "DeltaK Terminology",
];
