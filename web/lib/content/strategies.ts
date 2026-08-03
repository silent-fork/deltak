import type { Leg } from "@/lib/content/payoff";

export type StrategyCategory = "Bullish" | "Bearish" | "Volatility" | "Neutral";
export type StrategyComplexity = "Beginner" | "Intermediate" | "Advanced";

export interface Strategy {
  slug: string;
  name: string;
  category: StrategyCategory;
  complexity: StrategyComplexity;
  outlook: string;
  summary: string;
  legs: Leg[];
  construction: string;
  idealScenario: string;
  mistakes: string[];
  keywords: string[];
}

/**
 * Twelve strategies, beginner single-leg through advanced four-leg —
 * ordered as a curriculum, not alphabetically, so the hub page reads as a
 * path rather than a list. Every payoff number on the strategy pages is
 * derived from these leg definitions by `computePayoff` (lib/content/payoff.ts)
 * against the same illustrative NIFTY example, so the strike, premium and
 * P&L printed on the page can never drift out of sync with the chart drawn
 * above it.
 */
export const STRATEGIES: Strategy[] = [
  {
    slug: "long-call",
    name: "Long Call",
    category: "Bullish",
    complexity: "Beginner",
    outlook: "Strongly bullish",
    summary:
      "Buy one call, pay the premium, profit accelerates the further spot runs above your strike.",
    legs: [{ type: "call", action: "buy", offset: 0 }],
    construction:
      "Buy one at-the-money call. That's the whole position — one leg, one ticket, no spread to manage.",
    idealScenario:
      "You expect a sharp, sustained move higher before expiry — a breakout above Zenith resistance, a positive macro surprise, a stock-specific trigger. Because the entire risk is the premium paid upfront, a long call is how a directional view gets expressed without capital at risk beyond that one number.",
    mistakes: [
      "Buying deep OTM calls for the cheap premium and ignoring that time decay eats them fastest.",
      "Holding through the last two or three sessions before a weekly expiry, where theta decay accelerates regardless of direction.",
      "Sizing as if premium paid is a small cost — it's also the single most common way retail options accounts get wiped out, one lot at a time.",
    ],
    keywords: ["long call strategy", "buy call option india", "bullish options strategy nifty"],
  },
  {
    slug: "long-put",
    name: "Long Put",
    category: "Bearish",
    complexity: "Beginner",
    outlook: "Strongly bearish",
    summary: "Buy one put, pay the premium, profit as spot falls below your strike.",
    legs: [{ type: "put", action: "buy", offset: 0 }],
    construction:
      "Buy one at-the-money put. Same one-leg simplicity as a long call, mirrored for a down move.",
    idealScenario:
      "You expect a fast move lower — an Aegis support level failing, a negative catalyst, index-wide risk-off. Max loss is the premium paid; profit builds as spot falls, capped only by the floor of zero.",
    mistakes: [
      "Forgetting that implied volatility often expands going into a fall, so puts bought after the drop has started cost more than puts bought ahead of it.",
      "Using a long put to \"hedge\" a bullish portfolio without sizing it to the delta actually being offset.",
      "Letting a losing long put ride into expiry week instead of accepting the theta bleed and closing early.",
    ],
    keywords: ["long put strategy", "buy put option india", "bearish options strategy nifty"],
  },
  {
    slug: "bull-call-spread",
    name: "Bull Call Spread",
    category: "Bullish",
    complexity: "Beginner",
    outlook: "Moderately bullish",
    summary:
      "Buy a call, sell a further OTM call against it — cheaper than a naked call, capped profit in exchange for a lower breakeven.",
    legs: [
      { type: "call", action: "buy", offset: 0 },
      { type: "call", action: "sell", offset: 2 },
    ],
    construction:
      "Buy one ATM call and sell one call two strikes higher, same expiry, same lot. The premium collected from the short leg partially funds the long leg.",
    idealScenario:
      "You're bullish but not betting on a runaway move — you want a cheaper breakeven than a naked long call and are comfortable capping the upside at the short strike in exchange for it.",
    mistakes: [
      "Setting the short strike so close to the long strike that the spread barely reduces cost, defeating the point of the trade.",
      "Treating the max profit at the short strike as guaranteed rather than as a cap that still requires spot to actually get there.",
      "Forgetting it's still a two-legged position to unwind — exiting only the long leg leaves a naked short call open by accident.",
    ],
    keywords: ["bull call spread", "call spread strategy nifty", "vertical spread options india"],
  },
  {
    slug: "bear-put-spread",
    name: "Bear Put Spread",
    category: "Bearish",
    complexity: "Beginner",
    outlook: "Moderately bearish",
    summary: "Buy a put, sell a further OTM put against it — the bearish mirror of a bull call spread.",
    legs: [
      { type: "put", action: "buy", offset: 0 },
      { type: "put", action: "sell", offset: -2 },
    ],
    construction:
      "Buy one ATM put and sell one put two strikes lower, same expiry, same lot — the short put funds part of the long put's premium.",
    idealScenario:
      "A moderate down move is your view, not a crash. You give up profit below the short strike in exchange for a materially cheaper entry than a naked put, with defined risk on both sides.",
    mistakes: [
      "Picking a short strike too far below spot, which barely lowers the premium paid.",
      "Ignoring that the short put still carries real mark-to-market risk — it's not a free lower leg.",
      "Forgetting this caps gains exactly where a genuine crash would have paid the most on a naked put.",
    ],
    keywords: ["bear put spread", "put spread strategy nifty", "bearish vertical spread india"],
  },
  {
    slug: "long-straddle",
    name: "Long Straddle",
    category: "Volatility",
    complexity: "Intermediate",
    outlook: "Big move, either direction",
    summary:
      "Buy the ATM call and the ATM put together — profits from a large move either way, loses if spot pins near the Quantum Horizon into expiry.",
    legs: [
      { type: "call", action: "buy", offset: 0 },
      { type: "put", action: "buy", offset: 0 },
    ],
    construction:
      "Buy one ATM call and one ATM put, same strike, same expiry. Two premiums paid, direction doesn't matter — magnitude does.",
    idealScenario:
      "Ahead of a binary event — a budget day, an RBI policy call, results week — where you expect a big move but genuinely don't know which way. Breakeven sits on both sides of the strike, roughly ATM plus or minus the combined premium paid.",
    mistakes: [
      "Buying a straddle into an event everyone else is buying it for — the IV crush after the announcement can lose money even on a correct directional call.",
      "Holding through a full week of range-bound chop, where theta decay on two long legs compounds instead of one.",
      "Not having a plan for \"spot didn't move\" — a straddle's worst outcome isn't the wrong direction, it's no direction at all.",
    ],
    keywords: ["long straddle strategy", "straddle options india", "event based options strategy"],
  },
  {
    slug: "long-strangle",
    name: "Long Strangle",
    category: "Volatility",
    complexity: "Intermediate",
    outlook: "Big move, either direction, cheaper entry",
    summary: "Buy an OTM call and an OTM put — a cheaper, wider-breakeven cousin of the long straddle.",
    legs: [
      { type: "call", action: "buy", offset: 2 },
      { type: "put", action: "buy", offset: -2 },
    ],
    construction:
      "Buy an OTM call a couple of strikes above spot and an OTM put a couple of strikes below it, same expiry. Lower combined premium than a straddle, but spot has to travel further to clear either breakeven.",
    idealScenario:
      "Same big-move, unsure-direction thesis as a long straddle, but you want to pay less for it and accept wider breakevens in exchange. Works best when you expect a genuinely large move, not just above-average volatility.",
    mistakes: [
      "Choosing strikes so far OTM that both legs are near-worthless and need an enormous move to pay off.",
      "Underestimating how much of the premium is time value that decays daily regardless of realized volatility.",
      "Confusing \"cheaper than a straddle\" with \"safer than a straddle\" — it's cheaper because it needs a bigger move to work, not because it risks less.",
    ],
    keywords: ["long strangle strategy", "strangle options india", "cheap volatility options strategy"],
  },
  {
    slug: "short-straddle",
    name: "Short Straddle",
    category: "Volatility",
    complexity: "Advanced",
    outlook: "Range-bound, high conviction",
    summary:
      "Sell the ATM call and ATM put together — collects the richest premium on the chain, at the cost of theoretically open-ended risk on both sides.",
    legs: [
      { type: "call", action: "sell", offset: 0 },
      { type: "put", action: "sell", offset: 0 },
    ],
    construction:
      "Sell one ATM call and one ATM put, same strike, same expiry — pure premium collection, no protective wings. The two premiums received are the most this trade can ever make.",
    idealScenario:
      "High conviction that spot pins near the current level into expiry — a quiet consolidation session, the kind DeltaK's own Protocol Delta reads as a Volatility Trap regime. This is an income strategy, not a directional one, and it needs active risk management, not a set-and-forget ticket.",
    mistakes: [
      "Running this uncapped through an event week — the same binary catalysts a long straddle is built for are exactly what blows up a short one.",
      "Treating available margin as margin that should be used — undefined risk on both sides means position size has to stay conservative regardless of what the exchange allows.",
      "No hard stop-loss on either leg — this strategy's entire appeal (rich premium) is exactly proportional to the risk of an unhedged move through either breakeven.",
    ],
    keywords: ["short straddle strategy", "sell straddle nifty", "options selling strategy india"],
  },
  {
    slug: "short-strangle",
    name: "Short Strangle",
    category: "Volatility",
    complexity: "Advanced",
    outlook: "Range-bound, wider comfort zone",
    summary:
      "Sell an OTM call and an OTM put — less premium than a short straddle, but a meaningfully wider profit zone either side of spot.",
    legs: [
      { type: "call", action: "sell", offset: 2 },
      { type: "put", action: "sell", offset: -2 },
    ],
    construction:
      "Sell an OTM call a couple of strikes above spot and an OTM put a couple of strikes below it, same expiry. Lower premium collected than a short straddle in exchange for two further-out breakevens.",
    idealScenario:
      "The same range-bound thesis as a short straddle, but with a margin of error either side — useful when the Aegis and Zenith walls are holding but you're not confident enough in the exact pin to sell straight at the money.",
    mistakes: [
      "Selling strangles with legs so close to ATM that they're a short straddle in everything but name, without the full premium to show for the risk.",
      "Ignoring skew — index puts often carry richer premium than equidistant calls, which changes which side of the strangle is actually doing the work.",
      "Adjusting only one side after a move instead of reassessing the whole position — a strangle is one trade, not two independent bets.",
    ],
    keywords: ["short strangle strategy", "sell strangle nifty", "range bound options strategy india"],
  },
  {
    slug: "iron-condor",
    name: "Iron Condor",
    category: "Neutral",
    complexity: "Advanced",
    outlook: "Range-bound, defined risk",
    summary:
      "A short strangle with both wings bought back further out — the defined-risk way to sell premium without open-ended exposure on either side.",
    legs: [
      { type: "put", action: "buy", offset: -4 },
      { type: "put", action: "sell", offset: -2 },
      { type: "call", action: "sell", offset: 2 },
      { type: "call", action: "buy", offset: 4 },
    ],
    construction:
      "Sell an OTM put and OTM call (the short strangle), then buy a further OTM put below and a further OTM call above as protection. Four legs, one ticket, and the max loss is fixed the moment it's placed.",
    idealScenario:
      "The classic range-bound income trade for a session where Aegis and Zenith both look solid and neither wall is migrating — DeltaK's Protocol Alpha regime in spirit, even run manually. You give up some of the short strangle's premium to buy the wings, and get a hard ceiling on loss in return.",
    mistakes: [
      "Setting the wings so close to the short strikes that the credit collected barely covers the width, making the risk/reward asymmetric against you.",
      "Forgetting all four legs need managing together — closing only the short side and leaving the long wings open defeats the entire structure.",
      "Treating it as a market-neutral free lunch — a condor sold with skewed strikes is a bet the range holds where you think it will, not automatically where the market thinks it will.",
    ],
    keywords: ["iron condor strategy", "iron condor nifty", "defined risk options strategy india"],
  },
  {
    slug: "iron-butterfly",
    name: "Iron Butterfly",
    category: "Neutral",
    complexity: "Advanced",
    outlook: "Pin risk, defined risk",
    summary:
      "A short straddle at the money with both wings bought further out — richer premium than an iron condor, a narrower profit zone.",
    legs: [
      { type: "put", action: "buy", offset: -3 },
      { type: "put", action: "sell", offset: 0 },
      { type: "call", action: "sell", offset: 0 },
      { type: "call", action: "buy", offset: 3 },
    ],
    construction:
      "Sell an ATM put and ATM call (the short straddle), then buy a put and a call further out on either side as protection. The short strikes sit exactly at spot instead of a strike or two away.",
    idealScenario:
      "A sharper version of the range-bound thesis than an iron condor — you're not just betting the range holds, you're betting spot pins close to today's level specifically, in exchange for more premium collected.",
    mistakes: [
      "Running it with the same wing-width intuition as an iron condor — the ATM short strikes mean the profit zone is inherently tighter and needs respecting as such.",
      "Placing it without a real view on where spot actually pins — unlike a condor, there's no room for \"somewhere in a range\", it's \"close to here, specifically\".",
      "Ignoring gamma risk into the final session — an ATM short-straddle core means P&L swings hardest exactly when expiry is closest.",
    ],
    keywords: ["iron butterfly strategy", "iron butterfly nifty options", "options selling strategy expiry"],
  },
  {
    slug: "call-ratio-backspread",
    name: "Call Ratio Backspread",
    category: "Bullish",
    complexity: "Advanced",
    outlook: "Explosive upside, capped mid-range risk",
    summary:
      "Sell one ATM call, buy two further OTM calls — small defined risk in the middle, real profit if spot runs hard, without a straddle's full cost.",
    legs: [
      { type: "call", action: "sell", offset: 0 },
      { type: "call", action: "buy", offset: 2, qty: 2 },
    ],
    construction:
      "Sell one ATM call and buy two calls two strikes higher, same expiry — net long two calls against one short, usually for a small net credit or close to zero cost depending on the smile.",
    idealScenario:
      "You want convex, open-ended upside exposure like a long call, but you're willing to accept a defined loss zone in the middle of the range — where the short call's cost outpaces the two long calls — in exchange for cutting the net premium outlay versus buying two naked calls.",
    mistakes: [
      "Ignoring the \"dead zone\" between the short strike and the long strikes, where the position can lose more than either a single long call or doing nothing at all.",
      "Sizing the short leg 1:1 without checking whether the resulting position is a net credit or a net debit — that changes the whole risk picture.",
      "Deploying this as a default bullish trade rather than reserving it for real conviction that a move, if it comes, comes hard and fast.",
    ],
    keywords: ["call ratio back spread", "ratio spread options strategy", "advanced bullish options strategy india"],
  },
  {
    slug: "jade-lizard",
    name: "Jade Lizard",
    category: "Neutral",
    complexity: "Advanced",
    outlook: "Range to moderately bullish, no upside risk by design",
    summary:
      "A short put plus a short call spread — collected premium engineered to exceed the call spread's width, which removes upside risk entirely if it's built right.",
    legs: [
      { type: "put", action: "sell", offset: -2 },
      { type: "call", action: "sell", offset: 2 },
      { type: "call", action: "buy", offset: 4 },
    ],
    construction:
      "Sell an OTM put, and separately sell a call spread — a short call plus a further OTM long call as its cap. Three legs, and the strike and width selection is the entire point of the trade.",
    idealScenario:
      "You're comfortable owning downside risk, as with any short put, but specifically want zero risk if spot rallies instead. As long as total premium collected exceeds the width between the two call strikes, there's no price above which this position loses money — that asymmetry, not the premium itself, is what the strategy is actually selling.",
    mistakes: [
      "Building it with total credit less than the call spread's width, which silently reintroduces upside risk and defeats the entire premise of the trade.",
      "Treating it as low-risk because \"no upside risk\" sounds safe — the downside from the naked short put is real and uncapped down to zero.",
      "Skipping the width-vs-credit check at entry and only noticing the position wasn't actually risk-free above the market on the way there.",
    ],
    keywords: ["jade lizard strategy", "jade lizard options india", "no upside risk options strategy"],
  },
];

export function getStrategy(slug: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.slug === slug);
}

export const STRATEGY_EXAMPLE = {
  underlying: "NIFTY",
  spot: 25000,
  strikeStep: 50,
  lotSize: 75,
} as const;
