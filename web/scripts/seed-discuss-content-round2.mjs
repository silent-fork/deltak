#!/usr/bin/env node
/**
 * Second one-off seed for /discuss — six more DeltaK-authored threads across
 * Strategy, Market Talk and General (two discussion threads and one article
 * per category, General gets one discussion) — same Identity Toolkit +
 * Firestore REST pattern as scripts/seed-discuss-content.mjs, kept as a
 * separate file rather than appended there since that script isn't
 * idempotent (no existing-thread check) and re-running it would duplicate
 * the Welcome/F&O article threads it already created.
 *
 * Requires the same environment variables as seed-discuss-content.mjs:
 *   FIREBASE_PROJECT_ID, FIREBASE_API_KEY, DELTAK_FORUM_EMAIL, DELTAK_FORUM_PASSWORD
 * — reuse the same DELTAK_FORUM_EMAIL/PASSWORD so this posts as the same
 * "DeltaK" account and byline as the first seed.
 *
 * Run: FIREBASE_PROJECT_ID=... FIREBASE_API_KEY=... DELTAK_FORUM_EMAIL=... \
 *      DELTAK_FORUM_PASSWORD=... node scripts/seed-discuss-content-round2.mjs
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const API_KEY = process.env.FIREBASE_API_KEY;
const EMAIL = process.env.DELTAK_FORUM_EMAIL;
const PASSWORD = process.env.DELTAK_FORUM_PASSWORD;

for (const [name, value] of Object.entries({
  FIREBASE_PROJECT_ID: PROJECT_ID,
  FIREBASE_API_KEY: API_KEY,
  DELTAK_FORUM_EMAIL: EMAIL,
  DELTAK_FORUM_PASSWORD: PASSWORD,
})) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const IDENTITY_ROOT = "https://identitytoolkit.googleapis.com/v1";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function identityCall(path, body) {
  const res = await fetch(`${IDENTITY_ROOT}${path}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, payload };
}

async function signUpOrSignIn(email, password) {
  const signUp = await identityCall("/accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  if (signUp.ok) return signUp.payload;
  if (signUp.payload?.error?.message !== "EMAIL_EXISTS") {
    throw new Error(`Sign-up failed: ${JSON.stringify(signUp.payload)}`);
  }
  const signIn = await identityCall("/accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });
  if (!signIn.ok) throw new Error(`Sign-in failed: ${JSON.stringify(signIn.payload)}`);
  return signIn.payload;
}

function toValue(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  return { stringValue: v };
}

function toFields(input) {
  const fields = {};
  for (const [k, v] of Object.entries(input)) fields[k] = toValue(v);
  return fields;
}

async function firestoreGet(path, idToken) {
  const res = await fetch(`${FIRESTORE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Firestore GET ${path} failed: ${JSON.stringify(body)}`);
  return body;
}

async function firestoreCreate(collectionPath, fields, idToken, docId) {
  const query = docId ? `?documentId=${encodeURIComponent(docId)}` : "";
  const res = await fetch(`${FIRESTORE_BASE}/${collectionPath}${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields: toFields(fields) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Firestore create ${collectionPath} failed: ${JSON.stringify(body)}`);
  return body;
}

/** Skips creating a thread if one with the same title already exists in that category — makes this script safe to re-run. */
async function firestoreQueryExistingTitle(category, title, idToken) {
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "forumThreads" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "category" }, op: "EQUAL", value: { stringValue: category } } },
              { fieldFilter: { field: { fieldPath: "title" }, op: "EQUAL", value: { stringValue: title } } },
            ],
          },
        },
        limit: 1,
      },
    }),
  });
  const body = await res.json().catch(() => []);
  return Array.isArray(body) && body.some((r) => r.document);
}

const AUTHOR_NAME = "DeltaK";

const PIECES = [
  {
    category: "strategy",
    postType: "discussion",
    title: "Rolling vs. closing a short strangle that's moved against you — how do you decide?",
    body: `Every strangle seller eventually has one side test the short strike hard, and the honest answer is there's no single rule — but here's the framework I actually use, and I'm curious how it compares to what other people here do.

**The three levers that matter, in order:**

1. **Delta on the tested side.** Once the short option's delta crosses roughly 0.30–0.35, it's no longer behaving like the "low-probability" premium you sold — it's trading like a directional bet against you. That's usually my first trigger to *think*, not necessarily to act.
2. **Days to expiry.** The same delta breach with 3 DTE left is a completely different problem than with 20 DTE left. Close to expiry, theta is doing most of the work for you and a roll just resets the clock on risk you were about to collect on. Far from expiry, a roll can genuinely improve your position rather than just delaying a decision.
3. **Why it moved.** A strike getting tested because IV expanded (the whole chain repriced) is different from a strike getting tested because the underlying actually broke a level. The first is often mean-reverting; the second isn't obligated to be.

**Where I land on roll vs. close:**

- If it's still >7–10 DTE and the move looks IV-driven rather than a genuine breakout, I'll roll the tested side out in time and up/down in strike to re-center the strangle, taking the small debit if needed.
- If it's under a week to expiry, I usually just close — rolling a strangle that close to expiry into the next cycle rarely improves risk-adjusted return over just eating the loss and re-entering fresh.
- If price action looks like a genuine break (not just vol expansion), I close outright, full stop. Rolling into a trend is how a defined-loss strangle stops being defined-loss.

What I *don't* do: roll purely because "it'll come back." That's not a rule, that's a hope, and it's exactly how a manageable loss becomes an unmanageable one.

Genuinely curious what delta/DTE thresholds other people here actually use, and whether anyone has a more systematic way of separating IV-driven tests from real directional breaks.`,
  },
  {
    category: "strategy",
    postType: "discussion",
    title: "Iron condor vs iron butterfly into a range-bound expiry week — which do you reach for?",
    body: `Both are defined-risk, both profit from the underlying sitting still, and it's easy to treat them as interchangeable — but the shape of what you're actually betting on is pretty different, and I think that difference gets underrated.

**Iron condor** — short strikes spread apart, long strikes further out for protection. Wide profit tent, lower max profit, higher probability of *some* profit. You're betting the underlying stays inside a range, and you don't need to be precise about where inside that range it lands.

**Iron butterfly** — short strikes at the same strike (typically ATM), wings on both sides. Narrow profit tent, much higher max profit if you're right, lower probability of full profit. You're betting the underlying pins close to a specific level, not just "somewhere in a band."

**How I actually choose between them:**

- If my read is "this stays range-bound but I have no strong opinion on *where* in the range," condor. The width is what pays you for being vague.
- If my read is "this pins near the current level specifically" — post-event, low-catalyst week, price already consolidating tightly — butterfly, because the extra premium for precision is worth collecting when there's actual conviction on the level.
- Butterfly's Achilles heel: it's much more sensitive to the underlying drifting even a *little* off the short strike. A condor shrugs off drift inside its range; a butterfly starts bleeding almost immediately once price moves off center. If I'm not confident in the specific level, condor's forgiveness is worth more than butterfly's extra premium.

One thing I've noticed: butterflies get recommended a lot for "low IV, pinned expiry" setups, but entry timing matters more than people give it credit for — putting one on too early in the week gives price too much runway to drift off center before theta has done enough work to protect it.

How does everyone else split this decision — running condors as a default and only switching to butterfly for specific setups, or is it more situational than that for you?`,
  },
  {
    category: "strategy",
    postType: "article",
    title: "Diagonal Spreads: Financing a Directional View With Short-Dated Premium",
    body: `A diagonal spread is a calendar spread with a twist: instead of buying and selling the same strike across two expiries, you buy a longer-dated option at one strike and sell a shorter-dated option at a different strike. That one change turns a market-neutral income trade into something that can express an actual directional view while still collecting premium against the position — which is why diagonals get used far more by traders who have an opinion on direction than by traders who genuinely want to be neutral.

## The Basic Mechanics

Take a long-dated diagonal call spread as the example: buy a call 60 days out at a strike below the current price, and sell a call 20–25 days out at a strike above the current price. The long leg is the actual directional position — it behaves close to a synthetic long stock position because of its higher delta, while costing less capital and carrying defined risk. The short leg does two jobs at once: it collects premium that partially finances the long leg's cost, and it caps the position's upside for the current cycle in exchange for that premium.

When the short leg expires, assuming the underlying hasn't run past the short strike, the premium is kept and another short-dated call can be sold against the same long position — repeating the process, cycle after cycle, effectively renting out upside that wasn't being used anyway while the long-dated leg does the real directional work underneath.

## Why the Term Structure Matters More Than the Strikes

The strike selection gets most of the attention in how diagonals are usually taught, but the trade's actual edge comes from theta and vega behaving differently across the two legs — and that depends entirely on the IV term structure at entry.

Theta decays a short-dated option much faster, in percentage terms, than a longer-dated option at a similar delta — that's the entire mechanical reason the short leg can be sold and rebought cycle after cycle while the long leg's time value erodes far more slowly underneath it. This works cleanly when the term structure is normal (near-dated IV roughly in line with, or below, further-dated IV). It works against the trade when the curve is inverted — near-dated IV elevated relative to further-dated, usually around an event — because the leg being bought to finance the position is now expensive for its own tenor, not just cheap relative to what's being sold.

Vega tells the same story from a different angle: the long leg, being further out, carries more vega than the short leg. A diagonal is therefore *net long vega* even though it's short premium on the front leg — an IV crush after an event hurts a diagonal net-net, even on a leg that wasn't sold, because the long leg's vega exposure dominates. This is the single most common surprise for someone running their first diagonal into an earnings-style event: they focus on collecting premium from the short leg and don't notice they're still net long volatility overall.

## Managing the Position Through a Cycle

The decision that actually determines whether a diagonal performs is what happens when the short leg is tested — pushed hard enough that its strike is threatened before its own expiry. Three choices, same as any short option under pressure:

- **Roll the short leg out and up (or down)**, re-centering it further from the current price while still keeping it inside the long leg's own expiry window. This is the default response when the move looks sustainable and there's still runway before the long leg's expiry.
- **Let it get tested and buy it back at a loss**, accepting that the short leg's job this cycle didn't work out, without touching the long leg at all. The long leg is still doing what it was bought to do — a directional move against the short strike, if the short strike sits below the underlying directional thesis, might mean the trade overall is still working even while the short leg specifically loses.
- **Close the whole diagonal** if the move invalidates the original directional thesis the long leg was expressing in the first place — at that point the position isn't a diagonal that needs adjusting, it's a directional bet that was wrong, and no amount of short-leg management fixes that.

The mistake to avoid is treating the short leg's management as separate from the long leg's thesis. A diagonal is one trade with two legs doing different jobs, not two trades sharing a ticket.

## Where Diagonals Fit Relative to Other Structures

Compared to a straight long call, a diagonal costs less up front and has a defined, known maximum loss, but caps upside for the current cycle in exchange for that lower cost. Compared to a covered call financed with actual stock, a diagonal requires far less capital for a similar payoff shape, at the cost of the long leg having its own theta decay and finite expiry the way owning the underlying outright never does.

The trade works best for a genuine multi-week-to-multi-month directional view where reducing that position's cost basis over time is the goal, rather than paying full premium for a long-dated option and simply holding it. It works poorly as a substitute for a market-neutral income strategy — the net long vega and the directional long leg mean a diagonal is exposed to being wrong about direction in a way a true calendar spread, built at the same strike on both legs, isn't.`,
  },
  {
    category: "market-talk",
    postType: "discussion",
    title: "Reading OI buildup correctly — long buildup vs. short covering, and where people actually get it wrong",
    body: `The four-quadrant OI/price framework gets posted everywhere, so I won't belabor it, but I think the *labels* are where people go wrong more than the concept:

- Price up + OI up → **Long buildup** — fresh money coming in on the long side, real conviction.
- Price up + OI down → **Short covering** — shorts closing out, not fresh longs. Can look identical to long buildup on a price chart alone.
- Price down + OI up → **Short buildup** — fresh shorts, real conviction on the downside.
- Price down + OI down → **Long unwinding** — longs closing out, not fresh shorts.

The mistake I see constantly: treating a price-up move as bullish confirmation without checking which side of that quadrant it's actually on. A rally built on short covering has a materially different character than a rally built on long buildup — short covering tends to be sharper and more exhaustible (there's a finite amount of short interest to cover, and once it's gone, the buying pressure driving the move goes with it), while long buildup can persist as long as fresh conviction keeps showing up.

**Where it gets genuinely harder than the quadrant chart suggests:**

Aggregate OI numbers mix hedgers, arbitrageurs and directional traders in one figure — a rise in OI on an index future doesn't tell you the *composition* of who's adding, only that someone is. A big OI increase driven by a hedge position being rolled looks identical in the data to one driven by fresh directional conviction. This is exactly why single-session OI reads are noisy and multi-session trends — does the buildup persist across 3–4 sessions, or reverse the next day — are far more informative than any one day in isolation.

The other thing that trips people up: OI change has to be read *relative to* what a normal session looks like for that contract, not as an absolute number. A stock future's OI jumping 15% the session before its own results means something completely different from the same percentage jump on an unremarkable Tuesday.

How does everyone else here actually use OI in practice — as a standalone signal, or only ever as confirmation alongside price and volume? I lean heavily toward the latter; OI reads have looked completely convincing and still been wrong often enough that I don't trust it in isolation anymore.`,
  },
  {
    category: "market-talk",
    postType: "discussion",
    title: "Does Max Pain actually mean anything by expiry, or is it just correlation with what's already happening?",
    body: `Max Pain theory says price gravitates toward the strike where option writers, in aggregate, would owe the least at expiry — the strike where the total value of all outstanding calls and puts is minimized. It gets brought up constantly in expiry-week threads, so I want to actually pick it apart rather than just repeat it.

**The argument for it having some real effect:** option writers — often larger, better-capitalised participants — have a genuine economic incentive to hedge their book in a way that, in aggregate, can nudge price toward the strike that minimizes their payout. Market makers delta-hedging a large short-gamma book near a heavily open strike is a real, mechanical phenomenon, not folklore. Pinning *does* happen, and it happens more often exactly where you'd expect max-pain-style dynamics to matter: heavily open strikes near the current price on options-heavy names into a weekly expiry.

**The argument against treating it as predictive:** max pain is calculated from open interest as it exists right now, but OI itself changes constantly through expiry week as positions get added, closed, and rolled — the max pain strike calculated on Monday is frequently a different number by Thursday, precisely because the same trading activity that would cause pinning also changes what the max pain strike even is. A theory whose target keeps moving because of the same forces it's supposedly describing is hard to falsify cleanly, which is also part of why it's hard to *validate* cleanly.

There's also a selection-bias problem in how it usually gets discussed: "look, it pinned exactly at max pain" gets posted far more often than "max pain said X, price closed somewhere else, so it didn't work" — a few hundred points off on an index gets waved off as "close enough," which quietly does a lot of work in making the theory look more accurate in hindsight than it was in real time.

My honest take: it's real enough as a description of a genuine mechanical force, but weak enough as a *predictive* tool that I wouldn't build a trade around a max pain level in isolation — at most it's one more data point alongside OI concentration and where the actual volume is trading, not a level to trade toward on its own.

Where do people here actually land on this? Genuinely curious if anyone's tracked their own hit rate on it systematically rather than going off memorable examples.`,
  },
  {
    category: "market-talk",
    postType: "article",
    title: "Sector Rotation in NSE F&O: Reading It Without a Bloomberg Terminal",
    body: `Sector rotation — capital moving out of one part of the market and into another as the macro backdrop or the cycle shifts — is one of those ideas that's easy to nod along with and hard to actually *see* in real time without expensive tooling. Institutional desks track it with relative-strength dashboards most retail traders don't have access to. Here's how to approximate the same read using data that's actually free and public on NSE.

## What You're Actually Trying to Measure

Sector rotation isn't "which sector went up the most today" — that's just performance, and performance alone doesn't tell you whether money is rotating *in* or whether a sector is just having one strong session on no real flow behind it. What's actually being measured is **relative strength**: how a sector is performing against the broader index, not in isolation, and whether that relative performance is accelerating or decelerating.

A sector can be up 1% on a day the index is up 1.5% and be in relative *decline* even though the headline number looks fine. Conversely, a sector down 0.5% while the index is down 1.5% is showing real relative strength even though the raw number looks negative. Rotation is a story told in the *gap* between a sector and the benchmark, not in the sector's own number alone.

## Building the Read

**Step one — relative performance, not absolute.** For each NSE sectoral index (Bank, IT, Auto, Pharma, FMCG, Metal, and so on), track its return against Nifty 50's return over the same window, not its standalone return. A sector consistently outperforming the index over a rolling 2–4 week window is where relative strength actually shows up — a single strong day tells you almost nothing.

**Step two — cross-reference with F&O positioning, not just the cash index.** This is the step retail analysis usually skips, and it's the one that actually separates "the sector went up" from "money is rotating into the sector." Rising open interest in a sector's index futures and its heaviest F&O-eligible constituent stocks, alongside the relative-strength read from step one, is a materially stronger signal than price action alone — it means fresh positioning is backing the move, not just a rally with no conviction behind it (the same long-buildup-vs-short-covering distinction that matters for any single stock applies at the sector level too).

**Step three — plot the trajectory, not just the current state.** A single relative-strength reading is a snapshot; rotation is a *direction of travel*. Sectors moving from underperforming-and-improving into outperforming-and-still-improving are in the early-to-middle innings of a rotation into them. Sectors moving from outperforming-and-decelerating into flat-to-underperforming are rotation *out*, even while the sector's absolute price might still look fine on a chart — this is exactly the quadrant logic behind relative-rotation-graph-style tools, which plot relative strength against its own momentum rather than raw price, precisely so the deceleration shows up before the absolute price does.

## What This Actually Catches That Headline Numbers Miss

The value of this exercise isn't finding the sector that already ran — by the time a sector's absolute performance is impossible to miss, the early part of the move is usually over and everyone else has seen it too. The value is catching the *early* signature: a sector quietly building relative strength against the index while its own price action still looks unremarkable, backed by rising F&O positioning rather than just cash-market volume. That combination — relative strength improving, positioning building, absolute price still boring — is the closest a retail trader gets to spotting institutional rotation before it's obvious in the headline number.

None of this requires anything beyond NSE's own published index data and F&O open interest figures, both freely available — it just requires actually comparing sectors against the benchmark and against each other, rather than reading each sector's chart in isolation, which is the habit that misses rotation almost every time.`,
  },
  {
    category: "general",
    postType: "discussion",
    title: "What's one options mistake early on that actually changed how you trade now?",
    body: `Not looking for the generic "undefined risk bad" answer everyone already knows — more interested in the specific moment something clicked, or the specific mistake that changed an actual habit, not just a rule you now recite.

For me it was position sizing relative to *how wrong I could be*, not relative to how confident I felt. I sized a trade based on conviction once, got the direction completely right, and still took a bigger loss than I should have because I'd sized it as if "I'm probably right" meant "I can afford to be more wrong." Those aren't the same thing, and conflating them is a much easier trap to fall into than the textbook version of the lesson makes it sound.

Curious what other people's version of this is — the mistake that didn't just teach a rule, but actually changed a habit.`,
  },
];

async function postThread(uid, idToken, { category, title, body, postType }) {
  const now = new Date();
  const threadDoc = await firestoreCreate(
    "forumThreads",
    {
      category,
      title,
      authorUid: uid,
      authorName: AUTHOR_NAME,
      createdAt: now,
      replyCount: 0,
      lastActivityAt: now,
      pinned: false,
      locked: false,
      postType,
      sourceLink: null,
      sourceName: null,
    },
    idToken,
  );
  const threadId = threadDoc.name.split("/").pop();

  await firestoreCreate(
    `forumThreads/${threadId}/posts`,
    { body, authorUid: uid, authorName: AUTHOR_NAME, createdAt: now, editedAt: null, deletedAt: null, likeCount: 0 },
    idToken,
  );

  return threadId;
}

async function main() {
  console.log(`Signing in as ${EMAIL}...`);
  const auth = await signUpOrSignIn(EMAIL, PASSWORD);
  const { idToken, localId: uid } = auth;
  console.log(`Signed in — uid ${uid}`);

  const existingProfile = await firestoreGet(`/forumProfiles/${uid}`, idToken);
  if (!existingProfile) {
    console.log(`Creating forumProfiles/${uid} with displayName "${AUTHOR_NAME}"...`);
    await firestoreCreate(
      "forumProfiles",
      { displayName: AUTHOR_NAME, email: EMAIL, createdAt: new Date(), postCount: 0, role: "member" },
      idToken,
      uid,
    );
  }

  for (const piece of PIECES) {
    const already = await firestoreQueryExistingTitle(piece.category, piece.title, idToken);
    if (already) {
      console.log(`Skipping (already exists): [${piece.category}] ${piece.title}`);
      continue;
    }
    console.log(`Posting [${piece.category}/${piece.postType}] ${piece.title}...`);
    const id = await postThread(uid, idToken, piece);
    console.log(`  /discuss/${piece.category}/${id}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
