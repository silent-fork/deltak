export interface TradingStyle {
  slug: string;
  name: string;
  /** A couple of words for the pill/badge — the full sentence lives in `horizon`. */
  durationLabel: string;
  horizon: string;
  summary: string;
  howItWorks: string[];
  suitedFor: string;
  risks: string[];
  exampleTrade: string[];
  keywords: string[];
}

export const TRADING_STYLES: TradingStyle[] = [
  {
    slug: "intraday-options-trading",
    name: "Intraday Options Trading",
    durationLabel: "Minutes–Hours",
    horizon: "Minutes to hours — every position closed before the session ends",
    summary:
      "Positions opened and closed inside a single trading session, no overnight exposure to a gap on the next open.",
    howItWorks: [
      "Every position is flat by close, whether the read was right or wrong — an intraday trader is deliberately choosing to give up whatever a position might have done overnight in exchange for zero overnight gap risk. That trade-off is the whole style, not a footnote to it.",
      "Because there's no overnight holding, intraday work leans on the fastest-moving parts of the chain — live wall migration (Aegis, Zenith), tick-by-tick RRG rotation, and OI buildup that's visibly still forming, all of which reset or renew the next session anyway.",
      "Most intraday index-options activity concentrates in the near-ATM strikes around the Quantum Horizon, where liquidity and responsiveness to spot are both highest — far-OTM strikes can sit nearly frozen for a whole session even while the underlying moves.",
    ],
    suitedFor:
      "Traders who can watch the session live (or automate the watching), want zero overnight event risk, and are comfortable that a strategy's edge has to show up inside a few hours, not over days.",
    risks: [
      "Overtrading — the ability to enter and exit all day doesn't mean every hour of the session offers a real edge.",
      "Underestimating intraday theta and slippage costs across several round trips in a single session.",
      "Forcing a close near the session end at a worse price than the position was actually worth minutes earlier, purely to satisfy the no-overnight rule.",
    ],
    exampleTrade: [
      "NIFTY opens near 25,000 and by mid-morning is grinding into 24,900 support with put OI actively building there — Aegis holding, not just being tested. An intraday trader buys the 24,850 put (2nd ITM under the Zero-OTM rule) for roughly ₹90, watching for RRG rotation into a Leading quadrant to confirm the entry rather than acting on the OI alone.",
      "If 24,900 fails and spot cascades to 24,800 within the hour, that put might be worth ₹160-180 — the position is closed well before the close, banking the intraday move rather than holding it overnight into whatever the next session's gap brings.",
    ],
    keywords: ["intraday options trading india", "intraday nifty options strategy", "options scalping nifty"],
  },
  {
    slug: "swing-options-trading",
    name: "Swing Options Trading",
    durationLabel: "Days–Weeks",
    horizon: "A few days to a couple of weeks — typically held across a single expiry cycle",
    summary:
      "Positions held across multiple sessions to capture a move that plays out over days, not minutes — usually inside one weekly or monthly expiry.",
    howItWorks: [
      "A swing position accepts overnight and weekend gap risk in exchange for room for a thesis to actually play out — a wall migration that's just started, a regime shift between DKMS protocols that hasn't fully resolved yet, a trend that a single session's data wouldn't confirm.",
      "Time decay is a bigger factor here than in intraday work, since the position is held through multiple sessions of theta — favoring strategies with defined or partially hedged decay (spreads) over naked long premium, unless the swing thesis specifically is that a big move is coming.",
      "Expiry selection matters more for swing trades than intraday ones: a position meant to run a week needs an expiry with enough runway left, not the nearest one about to decay hardest.",
    ],
    suitedFor:
      "Traders who can't watch the market live all session but can check in daily, and want a thesis that plays out over days rather than requiring a same-session outcome.",
    risks: [
      "Overnight and weekend gaps on results, policy announcements or global cues that can move spot well beyond a session's typical range.",
      "Holding a spread or straddle through an expiry that's already reflected the expected move, collecting the theta bleed with nothing left to catch.",
      "Under-monitoring a multi-day position and missing the point where the original wall-migration or regime thesis has actually reversed.",
    ],
    exampleTrade: [
      "Zenith has been migrating up from 25,100 to 25,300 over three sessions while Aegis holds firm at 24,800 — a Protocol Beta read, not a one-session blip. A swing trader buys a bull call spread instead of a naked call: the 25,000 call for ₹180, funded partly by selling the 25,100 call for ₹90, for a net debit of ₹90 per share and a maximum profit of ₹10 per share (₹750 for one lot) if spot finishes at or above 25,100.",
      "The position is held through several sessions of ordinary chop, with the thesis intact as long as Zenith keeps migrating up rather than reverting to holding at 25,100 — at which point the swing thesis itself, not just the P&L, has been invalidated.",
    ],
    keywords: ["swing trading options india", "swing trade nifty options", "positional options strategy"],
  },
  {
    slug: "positional-options-trading",
    name: "Positional Options Trading",
    durationLabel: "Weeks–Monthly",
    horizon: "Weeks to a full monthly cycle — a slower-moving thesis, not a single expiry's move",
    summary:
      "Longer-held positions built around a broader view — a sustained trend, a persistent range, an ongoing regime — rather than a single week's expected move.",
    howItWorks: [
      "Positional trades typically favor the monthly contract over the weekly, since monthly open interest is deeper and more durable — closer to the walls DeltaK's COA Matrix weighs most heavily rather than a single week's OI that resets from scratch.",
      "Defined-risk, income-oriented structures (iron condors, iron butterflies, spreads) are common here specifically because a position held for weeks needs a known worst case, not an open-ended one riding through several sessions of unpredictable news flow.",
      "Position sizing tends to be smaller per trade than intraday or swing styles, precisely because more can happen — more results, more macro data, more policy events — over a multi-week hold than over a single session or a few days.",
    ],
    suitedFor:
      "Traders with a genuine multi-week view on range or trend, who are comfortable holding through ordinary daily noise as long as the broader thesis stays intact.",
    risks: [
      "Concentration risk — a single multi-week position typically ties up capital and margin far longer than an intraday or swing trade.",
      "Thesis drift — a market can grind slowly against a positional thesis for weeks before the account P&L makes the reversal obvious.",
      "Underestimating the compounding effect of multiple, spaced-out events (several data releases, more than one policy call) that a single-week trade would never have to survive.",
    ],
    exampleTrade: [
      "Both Aegis (24,800) and Zenith (25,200) have held on the monthly contract for two straight weeks with neither wall migrating — a genuine range, not a pause between trends. A positional trader sells an iron condor on the monthly expiry: short the 24,900 put and 25,100 call, long the 24,800 put and 25,200 call as wings, for a net credit of roughly ₹80 per share (₹6,000 per lot) and a defined max loss of ₹1,500 per lot if either wing gets breached.",
      "The position is left alone through the ordinary daily noise of a multi-week hold, with the only real trigger for early action being one of the walls actually starting to migrate — not every session's chop against it.",
    ],
    keywords: ["positional trading options india", "monthly options strategy nifty", "long term options trading strategy"],
  },
  {
    slug: "options-buying-vs-selling",
    name: "Options Buying vs. Options Selling",
    durationLabel: "Any Horizon",
    horizon: "A framing question, not a time horizon — applies across intraday, swing and positional styles alike",
    summary:
      "The single biggest fork in options trading style: paying premium for defined, capped risk and open-ended reward, versus collecting premium for the opposite trade-off.",
    howItWorks: [
      "A buyer pays premium upfront, has a hard-capped maximum loss (the premium itself), and needs the underlying to move enough, and fast enough, to overcome theta decay before profit shows up. Time is the buyer's enemy on every single held day.",
      "A seller collects premium upfront, has a maximum profit capped at that premium (unless spread-protected), and needs the underlying to not move too far, or not move at all, for the position to work. Time is the seller's ally on every single held day — theta decay is income, not a cost.",
      "Neither side is inherently \"safer\" — buying trades a high probability of a small, known loss for a lower probability of a large gain; selling trades the reverse. Most of the strategies on this wiki, from a plain long call through an iron condor, are really just different ways of mixing buying and selling legs to land somewhere specific on that spectrum.",
    ],
    suitedFor:
      "Every options trader eventually has to have a view on this, explicitly or by default — it's less a style you pick once than a dial every single trade sets somewhere along.",
    risks: [
      "Buying: systematically overpaying for premium in high-IV conditions, then losing it to IV crush regardless of direction.",
      "Selling: undersizing the tail risk of an undefined-risk short position because the day-to-day P&L looks like steady, low-drama income right up until it isn't.",
      "Treating \"buying\" or \"selling\" as an identity rather than a tool — the right choice depends on the specific setup, not a permanent preference.",
    ],
    exampleTrade: [
      "Two traders watch the same NIFTY chain at 25,000 ahead of a policy day. The buyer pays ₹180 for the ATM call — max loss ₹180 per share (₹13,500 per lot) if spot doesn't move, unlimited profit if it runs. The seller instead writes the ATM straddle, collecting ₹330 per share (₹24,750 per lot) — max profit is that ₹330 if spot pins exactly at 25,000, and the risk is open-ended on either side if it doesn't.",
      "Neither is the \"correct\" trade in isolation — the buyer is paying for optionality on a real move, the seller is being paid to bet against one. Which side makes sense depends entirely on the read of that specific session, not a fixed preference either trader should carry into every trade.",
    ],
    keywords: ["options buying vs selling", "option seller vs option buyer india", "which is better buying or selling options"],
  },
];

export function getTradingStyle(slug: string): TradingStyle | undefined {
  return TRADING_STYLES.find((t) => t.slug === slug);
}
