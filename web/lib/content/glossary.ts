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
 * complete definition, not a dead end. Every entry closes on a worked
 * example against the same illustrative NIFTY @ 25,000 / lot 75 / strike
 * step 50 numbers the strategy pages use, so a reader who's read one entry
 * carefully can read the numbers on any other without re-deriving them.
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
      "Example: a NIFTY 25,000 call trading at ₹180 with spot exactly at 25,000 is entirely time value, since the strike carries zero intrinsic value at the money. Two sessions later, with spot unchanged, that same call might trade closer to ₹120 — nothing about the market's view has to have changed for that ₹60 to disappear, only the calendar.",
    ],
    related: ["strike-price", "theta"],
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
      "Example: with NIFTY at 24,970, the listed strikes nearby are 24,900, 24,950, 25,000, 25,050 — each 50 points apart. A BANKNIFTY chain with spot at 51,230 instead lists 51,100, 51,200, 51,300 — 100 points apart, a wider step for a pricier, more volatile index.",
    ],
    related: ["at-the-money-atm", "in-the-money-itm"],
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
      "Example: with NIFTY at 25,000, the 25,000 call and put might trade around ₹180 and ₹150. Add them together — ₹330 — and that's the chain's own implied move for the week: roughly ±330 points either side of 25,000 priced in, before a single session has played out.",
    ],
    related: ["quantum-horizon", "in-the-money-itm"],
    keywords: ["atm option meaning", "at the money options india", "atm strike nifty"],
  },
  {
    slug: "in-the-money-itm",
    term: "In-The-Money (ITM)",
    category: "Options Basics",
    shortDef: "A call with a strike below spot, or a put with a strike above spot — has real intrinsic value.",
    body: [
      "An ITM option's premium is at least its intrinsic value, plus whatever time value the market still assigns it. Deep-ITM options behave closest to the underlying itself — high delta, low time decay as a share of premium — which is exactly why DeltaK's Zero-OTM rule restricts long entries to the 2nd or 3rd deepest ITM strike rather than the cheaper, faster-decaying OTM chain.",
      "Example: with NIFTY at 25,000, the 24,900 call is 100 points ITM. If it's trading at ₹230, at least ₹100 of that is guaranteed intrinsic value the moment spot stays put — only the remaining ₹130 is time value exposed to decay.",
    ],
    related: ["out-of-the-money-otm", "zero-otm-rule"],
    keywords: ["itm option meaning", "in the money options india", "deep itm options strategy"],
  },
  {
    slug: "out-of-the-money-otm",
    term: "Out-of-the-Money (OTM)",
    category: "Options Basics",
    shortDef: "A call with a strike above spot, or a put with a strike below spot — pure time value, no intrinsic value.",
    body: [
      "An OTM option is worth exactly zero at expiry unless spot crosses the strike first. That makes OTM premium cheap and its percentage returns explosive when a move does arrive — and equally why most OTM buyers lose the full premium most of the time. It's the honest reason instruments like far-OTM weekly calls get sold as \"lottery tickets\" in trading forums.",
      "Example: with NIFTY at 25,000, a 25,200 call bought for ₹40 is 100% time value. If spot finishes anywhere at or below 25,200 at expiry — even at 25,199 — that entire ₹40 is gone, no partial credit for how close it got.",
    ],
    related: ["in-the-money-itm", "moneyness"],
    keywords: ["otm option meaning", "out of the money options india", "otm option buying risk"],
  },
  {
    slug: "moneyness",
    term: "Moneyness",
    category: "Options Basics",
    shortDef: "Where a strike sits relative to spot right now — ITM, ATM, or OTM.",
    body: [
      "Moneyness isn't fixed at entry; it moves every tick as spot moves. A call bought OTM can finish ITM by expiry and vice versa — which is the entire reason option payoff is nonlinear and worth diagramming rather than just quoting a single number.",
      "It's also why a strategy's payoff has to be read as a curve across a whole range of possible expiry prices rather than a single figure — moneyness at entry says almost nothing about moneyness at expiry, which is exactly the point of plotting the curve in the first place rather than just quoting today's premium.",
      "Example: a 25,100 call bought when NIFTY was at 24,950 starts life OTM. If spot rallies to 25,150 by expiry, that same option — same strike, same contract — finishes ITM by 50 points. Nothing about the option changed; only where spot ended up relative to it.",
    ],
    related: ["at-the-money-atm", "in-the-money-itm"],
    keywords: ["moneyness of options", "moneyness meaning", "option moneyness explained"],
  },
  {
    slug: "breakeven-point",
    term: "Breakeven Point",
    category: "Options Basics",
    shortDef: "The underlying price at expiry where a position's total P&L is exactly zero.",
    body: [
      "A single long call's breakeven is strike plus premium paid; a single long put's is strike minus premium paid. Multi-leg strategies can have two breakevens (a straddle, a strangle) or one (a spread) — every strategy page on this wiki marks its breakeven(s) directly on the payoff diagram rather than making you derive them by hand.",
      "A defined-risk spread's breakeven sits between its two strikes, shifted by the net premium paid or received; an income structure like an iron condor has two breakevens, one on each side of the range it's selling — crossing either one starts eroding the credit collected until the position turns to loss.",
      "Example: a NIFTY 25,000 call bought for ₹180 breaks even at 25,180. Spot has to clear the strike by at least the premium paid — not just cross 25,000 — before the position shows a single rupee of profit.",
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
      "Because margin, brokerage and even STT are all calculated per lot rather than per share, lot size isn't just a sizing detail — it's the unit every other cost and risk figure on a position is built from, and getting it wrong cascades through every downstream calculation.",
      "Example: at a lot size of 75, a 10-point move in NIFTY is worth ₹750 to a single-lot position, not ₹10 — the lot size is the multiplier that turns an index-point move into an actual rupee P&L, and it's the first number that goes into sizing any trade correctly.",
    ],
    related: ["strike-price", "premium"],
    keywords: ["nifty lot size", "banknifty lot size", "fno lot size india"],
  },
  {
    slug: "option-chain",
    term: "Option Chain",
    category: "Options Basics",
    shortDef: "The full grid of calls and puts across every listed strike for one underlying and expiry.",
    body: [
      "A standard chain lists strike, premium, open interest, volume and implied volatility for calls on one side and puts on the other. DeltaK's own 4-Quadrant Option Chain reads it a step further — every strike carries its own RRG quadrant and RS-Ratio alongside the raw numbers, so the ladder shows which strikes are actually rotating, not just which are liquid.",
      "Example: scanning a NIFTY chain at 25,000, the 25,000 call and put both carry the richest premium (they're ATM), open interest is stacking up at 24,800 and 25,200 as the session's likely range, and volume clusters tightly near the money — three separate signals sitting side by side in the same grid, each telling a different part of the story.",
    ],
    related: ["open-interest-oi", "rrg-momentum"],
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
      "Example: a NIFTY 24,900 call, 100 points ITM, might carry a delta near 0.65 — a 10-point move in spot shifts its premium by roughly ₹6.50. A 25,200 call, far OTM, might carry a delta near 0.15 — the same 10-point move only shifts it by about ₹1.50.",
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
      "Example: a NIFTY ATM call at ₹180 with five sessions left might lose only ₹15-20 a day early in the week — then ₹40-50 in the final session alone, on an unchanged spot. Same option, same strike, decaying faster purely because there's less runway left.",
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
      "Example: an ATM option's delta might move from 0.45 to 0.65 on a single 100-point spot move in the last session before expiry. The same 100-point move a week earlier might have shifted that delta by only 0.05 — the option itself hasn't changed, only how much gamma is in play that close to expiry.",
    ],
    related: ["delta-greek", "vega"],
    keywords: ["gamma options greek", "gamma risk near expiry", "options gamma explained india"],
  },
  {
    slug: "vega",
    term: "Vega",
    category: "The Greeks",
    shortDef: "How much an option's premium changes for a one-point move in implied volatility.",
    body: [
      "Long options have positive vega (they gain value as IV rises) and short options have negative vega (they gain as IV falls). This is the mechanism behind the classic \"IV crush\" — a long straddle bought ahead of an event can lose money even on a correctly-timed move, because IV collapses the moment the uncertainty resolves, faster than the underlying's move can add value back.",
      "Example: an ATM straddle priced with IV around 14% might cost ₹330 combined. If IV jumps to 18% ahead of a policy announcement, with spot completely unchanged, that same straddle could reprice closer to ₹420 — pure vega, no move in the underlying involved at all.",
    ],
    related: ["implied-volatility-iv", "premium"],
    keywords: ["vega options greek", "iv crush explained", "vega meaning options trading"],
  },
  {
    slug: "implied-volatility-iv",
    term: "Implied Volatility (IV)",
    category: "The Greeks",
    shortDef: "The market's forward-looking estimate of how much the underlying will move, backed out of current option prices.",
    body: [
      "IV isn't a forecast of direction, only magnitude — it rises ahead of known catalysts (results, policy events, budget day) and typically falls sharply once the event passes, regardless of which way the market moved. High IV means richer premium on both sides of the chain: good for sellers writing straddles and strangles, expensive for buyers of straight calls and puts.",
      "Example: NIFTY's IV might sit around 11-12% through a quiet week, then spike to 16-18% heading into a budget session or an RBI policy day — the chain pricing in the uncertainty before the event, then typically collapsing back down within a session or two of the outcome being known.",
    ],
    related: ["vega", "premium"],
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
      "Example: a holiday falling on the usual expiry day typically moves that week's expiry to the previous trading session rather than skipping it entirely — a detail that matters most for anyone holding a position they're expecting to expire on a specific date.",
    ],
    related: ["monthly-expiry", "rollover"],
    keywords: ["nifty weekly expiry day", "weekly expiry rule india", "options expiry day nse bse"],
  },
  {
    slug: "monthly-expiry",
    term: "Monthly Expiry",
    category: "Indian F&O Rules",
    shortDef: "The last weekly expiry of the calendar month for a given index — carries the deepest liquidity and open interest.",
    body: [
      "Monthly expiry contracts accumulate open interest across the whole month rather than the single week a weekly contract lives for, which is why monthly OI levels are read as the more durable support/resistance signal — the walls DeltaK's COA engine weighs most heavily aren't the ones that reset every Tuesday or Thursday.",
      "It's also the contract most closely tied to futures rollover — the bulk of a month's directional futures positioning typically concentrates in the current series right up until the days before its own expiry, then shifts over to the next month as traders roll their exposure forward.",
      "Example: a NIFTY monthly contract's open interest at 24,800 that's been building for four straight weekly cycles is a far more durable signal of committed capital than the same strike's OI on a weekly contract that's only two sessions old — the monthly number has survived more sessions of testing.",
    ],
    related: ["weekly-expiry", "coa-matrix"],
    keywords: ["nifty monthly expiry", "monthly vs weekly expiry options", "monthly expiry open interest"],
  },
  {
    slug: "physical-settlement",
    term: "Physical Settlement",
    category: "Indian F&O Rules",
    shortDef: "SEBI's rule that in-the-money stock F&O contracts settle by actual delivery of shares, not a cash payout.",
    body: [
      "This applies to stock options and futures, not index options — NIFTY, BANKNIFTY and FINNIFTY are cash-settled, since there's no physical NIFTY to deliver. It matters most to anyone who holds a stock option ITM into expiry without closing it: the exchange will settle it into a real delivery position (and the margin obligation that comes with one), not a simple profit or loss credited to the account.",
      "The rule exists specifically to curb speculative cash-settled positions taken purely to bet on a stock's price with no intention of ever owning it — forcing genuine delivery risk back into single-stock F&O rather than letting it behave like a pure cash derivative the way index options do.",
      "Example: a trader holding one lot of a stock call that finishes 5% ITM, if left open into settlement, ends up owning the underlying shares at the strike price rather than receiving a cash credit — along with whatever fresh delivery margin that new equity position requires.",
    ],
    related: ["monthly-expiry", "stt-on-options"],
    keywords: ["physical settlement fo india", "stock options physical settlement", "itm option expiry stock"],
  },
  {
    slug: "stt-on-options",
    term: "Securities Transaction Tax (STT) on Options",
    category: "Indian F&O Rules",
    shortDef: "A transaction tax charged on options trades, including on exercise of ITM options at expiry.",
    body: [
      "STT is levied on the sell side of an options trade, and separately — often overlooked by newer traders — on the exercise of an option that expires in-the-money, calculated on the full intrinsic value at settlement rather than just the premium. That STT-on-exercise charge has occasionally been large enough to turn a barely-ITM position into a net loss after costs, which is why closing a position manually before expiry rather than letting a thin ITM strike auto-exercise is common practice among active traders. Rates change by government notification, so check the current schedule with your broker rather than trusting a fixed number here.",
      "Because the tax applies at exercise regardless of how thin the ITM margin is, many trading desks build automatic square-off logic for positions finishing only marginally in the money — specifically to avoid an exercise-triggered STT bill eating more value than the position's own residual profit.",
      "Example: an option finishing even ₹1 ITM still triggers STT on the entire intrinsic value at exercise — on a large lot size, that single charge can be enough on its own to turn a marginal, barely-profitable ITM finish into a net loss once every cost is added up.",
    ],
    related: ["physical-settlement", "monthly-expiry"],
    keywords: ["stt on options india", "securities transaction tax options", "stt on option exercise"],
  },
  {
    slug: "span-margin",
    term: "SPAN Margin",
    category: "Indian F&O Rules",
    shortDef: "The exchange's scenario-based minimum margin requirement for a futures or short-options position.",
    body: [
      "SPAN (Standard Portfolio Analysis of Risk) stress-tests a position against a grid of plausible price and volatility moves and requires margin equal to the worst plausible one-day loss in that grid. It's why margin for undefined-risk trades like a naked short straddle is substantial and can rise sharply on a volatile day — the exchange is repricing the worst case in real time, not charging a flat rate.",
      "Because SPAN recalculates continuously through the session rather than fixing once at entry, a position that comfortably cleared margin requirements at open can trigger a margin call by afternoon purely from a volatility spike — no adverse move in the position's own price required at all.",
      "Example: SPAN might require roughly ₹45,000 to hold a short NIFTY straddle on a quiet session — and jump to ₹65,000 or more overnight purely because implied volatility spiked, before spot itself has moved a single point.",
    ],
    related: ["exposure-margin", "circuit-limit"],
    keywords: ["span margin explained", "span margin options selling", "margin for short straddle india"],
  },
  {
    slug: "exposure-margin",
    term: "Exposure Margin",
    category: "Indian F&O Rules",
    shortDef: "An additional margin layered on top of SPAN, covering risk SPAN's scenario grid doesn't fully capture.",
    body: [
      "Total margin blocked for an F&O position is SPAN plus exposure margin, not SPAN alone — a distinction that matters when comparing a broker's quoted margin requirement against a back-of-envelope SPAN-only estimate and finding the real number higher.",
      "Unlike SPAN, which is scenario-based and can swing sharply with volatility, exposure margin tends to move more predictably with position size and notional value — which makes SPAN the harder of the two components to budget for in advance when sizing a new position.",
      "Example: a position whose SPAN works out to ₹40,000 might carry another ₹8,000-10,000 of exposure margin on top — the ₹40,000 alone was never the full amount actually blocked in the account.",
    ],
    related: ["span-margin", "circuit-limit"],
    keywords: ["exposure margin meaning", "span vs exposure margin", "total margin options india"],
  },
  {
    slug: "circuit-limit",
    term: "Circuit Limit (Dynamic Price Band)",
    category: "Indian F&O Rules",
    shortDef: "The exchange-set price band beyond which an order simply can't be placed for that session.",
    body: [
      "Individual stock and index options carry their own dynamic price bands, recalculated through the session, separate from the underlying's own circuit filter. A strike hitting its band can freeze new orders at that price even while the underlying keeps moving — a real execution risk on illiquid far-OTM strikes during a fast move, distinct from the underlying itself hitting an upper or lower circuit.",
      "The band itself is dynamic, not fixed for the day — it recalculates continuously through the session as the option's own price moves, unlike the underlying index's own circuit filter, which is typically set once and applies for the whole session.",
      "Example: a thinly-traded far-OTM put can hit its dynamic price band during a sharp move and simply stop accepting new orders at that level for several minutes — even while the underlying index is still moving freely — a real risk for anyone trying to exit that specific strike quickly.",
    ],
    related: ["span-margin", "exposure-margin"],
    keywords: ["circuit limit options india", "option price band nse", "dynamic price range options"],
  },
  {
    slug: "fo-ban-list",
    term: "F&O Ban List",
    category: "Indian F&O Rules",
    shortDef: "Stocks whose F&O open interest has crossed 95% of the market-wide position limit, restricted to reducing existing positions only.",
    body: [
      "A stock in ban doesn't stop trading — it stops accepting new F&O positions from anyone, exchange-wide, until open interest falls back under the threshold. It applies to individual stock F&O, not to the index contracts (NIFTY, BANKNIFTY, FINNIFTY) DeltaK trades, but it's a standard piece of Indian F&O plumbing worth knowing if a strategy here ever gets adapted to single-stock options.",
      "A stock typically enters the ban list after a period of concentrated F&O buildup relative to its available free float, and exits only once existing positions naturally unwind or expire — there's no manual override, only time and reduced open interest bring a stock back onto the tradable list.",
      "Example: a stock crossing 95% of its market-wide position limit gets frozen for new F&O positions the very next session, across every broker and every trader — existing positions can still be reduced or closed, but nobody can add a single fresh lot until open interest cools back under the threshold.",
    ],
    related: ["open-interest-oi", "circuit-limit"],
    keywords: ["fo ban list meaning", "stock in ban period fo", "market wide position limit india"],
  },
  {
    slug: "put-call-ratio-pcr",
    term: "Put-Call Ratio (PCR)",
    category: "Reading the Market",
    shortDef: "Total put open interest divided by total call open interest — a rough sentiment gauge, read contrarian more often than literally.",
    body: [
      "A PCR well above 1 is conventionally read as bearish sentiment building — but because a large PCR often reflects protective put buying or put writing at support rather than outright bearish conviction, it's traditionally read as a contrarian signal near its extremes rather than taken at face value. It's one input among several, never a signal on its own.",
      "PCR is most often watched on the index as a whole rather than at a single strike, since one strike's ratio can be skewed by a single large order — the aggregate reading across the full chain is traditionally treated as the more reliable sentiment gauge of the two.",
      "Example: a PCR of 1.4 (more puts than calls in open interest) looks bearish on the surface — but if that OI is concentrated in near-the-money puts written for premium right at a support level, it can just as easily mean writers are confident that level holds, the opposite conclusion from a purely literal reading.",
    ],
    related: ["open-interest-oi", "max-pain"],
    keywords: ["put call ratio meaning", "pcr nifty", "how to read pcr options"],
  },
  {
    slug: "max-pain",
    term: "Max Pain",
    category: "Reading the Market",
    shortDef: "The strike where total outstanding option value would be lowest at expiry — where option writers as a group lose the least.",
    body: [
      "The theory behind max pain is that large option writers have some influence pulling spot toward that strike into expiry, though the evidence for it as a reliable predictor is mixed at best and it should be treated as one context data point, not a target level to trade against blindly.",
      "Max pain is typically recalculated throughout the session as OI shifts, rather than fixed once at the start of the week — a strike that looked like max pain on Monday can easily be a different strike entirely by Thursday once enough OI has moved.",
      "Example: if NIFTY's total OI is heaviest around 25,000, max pain theory suggests some pull toward 25,000 into expiry — but plenty of real expiries close well away from their calculated max pain strike, which is exactly why it belongs alongside other reads, not in place of them.",
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
      "Example: a strike showing 5 lakh contracts of OI but only 2,000 traded today has a lot of standing exposure and little fresh activity — a strike with just 1 lakh OI but 50,000 traded today is seeing far more real, active repositioning, even with a fraction of the total OI.",
    ],
    related: ["oi-buildup-matrix", "coa-matrix"],
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
      "Example: NIFTY rallying 100 points while call OI at the strike just above spot rises sharply reads as long buildup — fresh conviction behind the move. The same 100-point rally with call OI at that strike falling instead reads as short covering — shorts running for the exit, a rally that often stalls the moment the covering is done.",
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
      "A low rollover percentage isn't automatically bearish or bullish on its own — it can reflect genuine profit-booking, reduced conviction, or simply a quieter month, and is normally read alongside price action rather than treated as a standalone signal.",
      "Example: if only 30% of NIFTY futures OI has rolled to the next month by the last Thursday before expiry, against a typical 55-60% at that point in the cycle, it's read as unusually low conviction carrying forward — traders would rather square off flat than keep the position running.",
    ],
    related: ["monthly-expiry", "weekly-expiry"],
    keywords: ["rollover meaning fo", "futures rollover explained", "nifty rollover percentage"],
  },
  {
    slug: "aegis",
    term: "Aegis",
    category: "DeltaK Terminology",
    shortDef: "DeltaK's name for the live support wall — the open-interest concentration beneath spot that price is being defended against.",
    body: [
      "Aegis isn't a fixed line drawn once; it's read fresh from where cumulative open interest is actually concentrated below spot, across two generations (COA 1.0 and 2.0 — see COA Matrix), and it migrates as writers add to it, defend it, or abandon it for a new strike. A solid Aegis is what lets DeltaK's Protocol Alpha and Beta engage a long entry at all — the moment it starts migrating instead of holding, that changes which protocol is armed.",
      "Example: if NIFTY's cumulative OI shows a wall of put writing at 24,800 that's held for three sessions running while spot chops between 24,850 and 25,000, that's Aegis holding firm. The moment writers start adding to 24,900 instead and letting 24,800 go quiet, Aegis has migrated — and that migration is exactly what re-reads which DKMS protocol is live.",
    ],
    related: ["zenith", "coa-matrix"],
    keywords: ["what is aegis in options trading", "aegis support wall deltak", "aegis zenith meaning"],
  },
  {
    slug: "zenith",
    term: "Zenith",
    category: "DeltaK Terminology",
    shortDef: "DeltaK's name for the live resistance wall — the open-interest concentration above spot that a rally is being capped against.",
    body: [
      "Zenith is Aegis's mirror on the call side: the strike above spot where writers have concentrated open interest, read live rather than fixed at the start of the session. A solid Zenith is what allows a put entry under Protocol Alpha or Gamma; a migrating Zenith is read as resistance being ceded, not just tested.",
      "Example: call OI stacked at 25,200 for a full week while NIFTY tests that level twice and fails both times reads as Zenith holding firm as resistance. A close above 25,200 with OI actively unwinding there instead reads as Zenith being ceded — a materially different signal from simply testing the level and bouncing off it.",
    ],
    related: ["aegis", "coa-matrix"],
    keywords: ["what is zenith in options trading", "zenith resistance wall deltak", "aegis zenith meaning"],
  },
  {
    slug: "quantum-horizon",
    term: "Quantum Horizon",
    category: "DeltaK Terminology",
    shortDef: "DeltaK's live ITM/OTM boundary through the option chain — the at-the-money line, redrawn tick by tick as spot moves.",
    body: [
      "Everything to the left of the Quantum Horizon is in-the-money for calls; everything to the right is in-the-money for puts. It's the same ATM concept every options trader already uses, just rendered as a literal, moving line through the live chain rather than something you have to mentally locate yourself strike by strike — and the reference point every payoff diagram on this wiki is drawn against.",
      "Example: with spot at 24,975, the Quantum Horizon sits between the 24,950 and 25,000 strikes — everything at or below 24,950 is ITM for calls, everything at or above 25,000 is ITM for puts. The instant spot ticks past 25,000, the line itself redraws to sit past it, no manual recalculation required.",
    ],
    related: ["at-the-money-atm", "zenith"],
    keywords: ["quantum horizon deltak", "atm horizon options chain", "what is quantum horizon"],
  },
  {
    slug: "coa-matrix",
    term: "COA Matrix",
    category: "DeltaK Terminology",
    shortDef: "Cumulative Open Interest Analysis — DeltaK's read of Aegis and Zenith across two OI generations at once.",
    body: [
      "COA 1.0 is the cumulative open-interest wall built up over the life of the contract; COA 2.0 is the OI generation actually being built today. Reading both together is what lets DeltaK tell an old, durable wall apart from today's writers building a fresh one at a different strike — the exact moment that shift happens is a migration event, and it's what actually re-arms which of the four DKMS protocols is live.",
      "Example: COA 1.0 might show a support wall built up across the whole month at 24,800, while COA 2.0 — tracking only today's writing — shows fresh OI stacking at 24,900 instead. Read together, that combination is an early signal support is migrating up, well before COA 1.0's slower-moving monthly picture would show it on its own.",
    ],
    related: ["aegis", "zenith"],
    keywords: ["coa matrix deltak", "cumulative open interest analysis", "coa 1.0 coa 2.0"],
  },
  {
    slug: "rrg-momentum",
    term: "RRG Momentum",
    category: "DeltaK Terminology",
    shortDef: "DeltaK's per-strike Relative Rotation Graph — RS-Ratio against RS-Momentum, sorted into Leading, Improving, Weakening and Lagging.",
    body: [
      "Borrowed from the sector-rotation RRG charts used in equity research and applied strike-by-strike instead of sector-by-sector: every strike on the chain gets its own quadrant, live. A Lagging quadrant is read as high-decay and is a hard gate against new long entries in DeltaK regardless of what the COA walls are doing — momentum and wall structure both have to agree before a signal is actionable.",
      "Example: the 25,000 strike showing rising RS-Ratio and rising RS-Momentum together sits in the Leading quadrant — a genuine candidate. The same strike with RS-Momentum turning down slides into Weakening, and if RS-Ratio rolls over too, into Lagging — a hard no for a new long, no matter how solid Aegis or Zenith look that session.",
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
      "Example: with NIFTY at 25,000, the rule permits a long entry at 24,900 or 24,850 (the 2nd and 3rd ITM strikes) — never at 25,000 itself (ATM) and never at 25,050 (OTM), deliberately giving up the cheaper premium of those strikes for slower decay and a delta that tracks spot more closely.",
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
      "Example: a session where Aegis holds firm at 24,800 and Zenith holds firm at 25,200 arms Protocol Alpha — buying the 2nd ITM strike at each wall, nothing taken in between. The instant Zenith starts climbing toward 25,300 while Aegis is still solid at 24,800, the regime flips to Protocol Beta and put purchases shut off entirely, without anyone flipping a switch.",
    ],
    related: ["aegis", "zenith"],
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
