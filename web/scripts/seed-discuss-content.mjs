#!/usr/bin/env node
/**
 * One-off seed for the /discuss forum's first two DeltaK-authored threads —
 * a pinned "Welcome to Discuss" post in General, and the long-form
 * "India's F&O Market in 2026" article pinned in Market Talk — via the same
 * Identity Toolkit + Firestore REST calls `lib/server/firebaseAuth.ts` /
 * `lib/server/forum.ts` make, run standalone here (Node's global fetch, no
 * framework) so it can run outside a request lifecycle.
 *
 * Requires, as environment variables:
 *   FIREBASE_PROJECT_ID, FIREBASE_API_KEY   — same as the app itself
 *   DELTAK_FORUM_EMAIL, DELTAK_FORUM_PASSWORD — the "DeltaK" author account;
 *     created on first run (via Identity Toolkit signUp), signed in on every
 *     run after (EMAIL_EXISTS from signUp falls back to signIn) — reuse the
 *     same two values every time so it's the same account, and the same
 *     byline, across every thread you seed this way.
 *
 * Also requires `firestore.rules` (repo root) to already be deployed —
 * a fresh/rules-less Firestore project denies every write this script makes.
 *
 * Run: FIREBASE_PROJECT_ID=... FIREBASE_API_KEY=... DELTAK_FORUM_EMAIL=... \
 *      DELTAK_FORUM_PASSWORD=... node scripts/seed-discuss-content.mjs
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

const ARTICLE_TITLE = "India's F&O Market in 2026: Scale, the Reform Wave, and the New 3:40 PM Close";
const ARTICLE_BODY = "India's equity derivatives segment is, by contract volume, the largest in the world \u2014 and has been since 2023, when NSE overtook every other exchange globally on that measure. Combined average daily turnover across NSE and BSE's futures and options segments ran to roughly \u20b9447 trillion in FY26, a market whose sheer size now shapes exchange infrastructure decisions the way it shapes retail trading apps. But the past 18 months have been the most consequential stretch of regulatory change this market has seen since weekly options themselves were introduced, and the most recent change \u2014 a ten-minute extension to the trading day \u2014 took effect just yesterday, on 3 August 2026. This piece covers both: where the market stands, and exactly what changed.\n\nWHAT F&O ACTUALLY IS, BRIEFLY\n\nFutures and options let a trader take a position on where an underlying \u2014 an index like NIFTY or BANKNIFTY, or an individual stock \u2014 will be at a future date, without holding the underlying itself. A future is an obligation: buy or sell at a fixed price on expiry. An option is a right, not an obligation: pay a premium now for the right to buy (a call) or sell (a put) at a fixed strike, and let it lapse worthless if the market doesn't cooperate. Index options, in particular weekly NIFTY options, are what turned India into the world's largest F&O market by contract count \u2014 a single weekly index option costs a few hundred to a few thousand rupees in premium per lot, which is what pulled in a retail base far larger than any single-stock derivatives market has managed anywhere else.\n\nTHE REGULATORY REFORM WAVE\n\nThat same accessibility is exactly what SEBI spent 2024 and 2025 trying to rein in. A study SEBI published in September 2024 \u2014 and updated the following year \u2014 found that 93% of individual traders in equity F&O lost money between FY22 and FY24, with aggregate losses exceeding \u20b91.8 lakh crore over those three years. FY25 was worse in absolute terms: net losses of individual traders widened by 41% to roughly \u20b91.05 lakh crore, even as the number of unique individual traders in the segment fell from 61.4 lakh in the first quarter of FY25 to 42.7 lakh by the fourth quarter \u2014 a decline SEBI itself attributes partly to the very measures described below.\n\nThe reform package that followed, phased in through late 2024 and into 2025, changed the market structure on several fronts at once:\n\nOne weekly expiry per exchange. Before the change, NSE and BSE each ran weekly options on multiple indices, stacking expiry-day volume and volatility across several contracts every week. SEBI's rule confined each exchange to a single weekly-expiry index \u2014 NSE kept NIFTY's weekly contract (Tuesday expiry); BANKNIFTY, FINNIFTY and MIDCPNIFTY lost their weekly contracts entirely and now expire monthly, on the last Tuesday. BSE was left with SENSEX as its weekly product, expiring Thursday \u2014 deliberately a different day from NIFTY's, so the week's expiry-driven flow doesn't concentrate on a single session.\n\nHigher lot sizes. Minimum contract value per lot was raised substantially, pushing up the capital required to take even a single-lot position \u2014 a direct attempt to price out the smallest, most speculative retail tickets rather than restrict access outright.\n\nUpfront premium collection. Option buyers now have their full premium collected upfront at order entry, closing a gap where intraday leverage on options premium had let traders run positions larger than their actual margin would otherwise support.\n\nRemoval of the expiry-day calendar-spread margin benefit. Calendar spreads (long one expiry, short another on the same strike) had received a margin discount that made expiry-day positioning artificially cheap; that discount no longer applies on the expiry date itself.\n\nIntraday position-limit monitoring. Position limits, previously checked at day-end, are now monitored through the trading session \u2014 closing another window where a trader could breach limits intraday and unwind before the end-of-day check caught it.\n\nThe combined effect shows up clearly in the turnover data: NSE's F&O turnover actually declined 18% even as industry-wide ADTV rose a modest 4.6% in FY26, a divergence market commentary has tied directly to this 18-month run of tightening. Fewer, larger, better-capitalised positions \u2014 exactly what the rules were built to produce \u2014 rather than a broader retail base placing smaller bets.\n\nTHE AUGUST 2026 TIMING CHANGE: 3:30 PM TO 3:40 PM\n\nThe newest change is structural rather than about position sizing, and it lands squarely on anyone watching a clock into the close. NSE circular dated 30 May 2026 announced that the normal market close for equity derivatives \u2014 both index and stock F&O \u2014 would move from 3:30 PM to 3:40 PM IST, effective 3 August 2026. That date has already passed as of this writing; the new timings are live.\n\nThe reason isn't really about derivatives at all \u2014 it's about how the cash market now sets its own closing price. From 3 August 2026, F&O-eligible cash equities stopped using NSE's old VWAP-based closing mechanism and moved to a four-stage Closing Auction Session (CAS), replacing a system where the closing price was simply the volume-weighted average price over the last 30 minutes of trading with one where it's the single equilibrium price discovered through an actual auction match:\n\nContinuous trading now ends at 3:15 PM for F&O-eligible stocks (10 minutes earlier than before). From 3:15\u20133:20 PM, the exchange computes a reference price from the VWAP of trades between 3:00 and 3:15 PM, and no fresh orders are accepted. From 3:20\u20133:25 PM, both market and limit orders are accepted into the auction book but not executed immediately. From 3:25 PM, only limit orders are accepted, and \u2014 deliberately \u2014 the order-entry window closes at a randomised moment between 3:28 and 3:30 PM specifically to discourage large last-second orders designed to move the print. Between 3:30 and 3:35 PM the exchange matches orders at whatever single price clears the maximum quantity of shares \u2014 that price becomes the official close. A post-close session runs 3:50\u20134:00 PM for trades at that settled price. Non-F&O stocks are untouched by any of this and continue closing the old way, at 3:30 PM.\n\nDerivatives trading itself \u2014 the actual F&O order book \u2014 simply runs 10 minutes longer, to 3:40 PM, so that F&O traders have a live market to react in while their underlying's closing price is still being discovered through the auction. The reference VWAP window used for setting stock-future price bands also shifted, now running 3:10\u20133:40 PM instead of ending at the old 3:30 PM close. SEBI's stated rationale is straightforward: a single large order landing in the last seconds of a VWAP window could disproportionately move the official closing price \u2014 the number every index fund, ETF, and MTM calculation in the country references \u2014 and an auction match is structurally harder to game that way. The same auction-based closing mechanism is already standard on most large global exchanges; India's cash market was a comparatively late adopter of it.\n\nWHAT IT ACTUALLY CHANGES FOR A TRADER\n\nFor anyone actually running positions into the close, the practical items are these: F&O contracts \u2014 this app included \u2014 now trade live until 3:40 PM, not 3:30 PM; any strategy, alert, or automated flatten timed to the old close needs to move ten minutes later, or it fires early against a market that's still open; the reference price your MTM or exit is measured against, for the underlying's own close, comes from the CAS auction rather than a trailing VWAP, which is a different number computed a different way; and if you're squaring off an intraday cash position in a CAS-eligible stock, that window effectively closes earlier now \u2014 around 3:10 PM rather than 3:20 PM \u2014 because continuous trading itself stops at 3:15 PM to make room for the auction.\n\nNone of this changes the shape of the reform story from 2024\u201325 \u2014 fewer weekly contracts, bigger lot sizes, tighter margin rules, all aimed at a segment where the regulator's own data says the overwhelming majority of individual participants lose money. What the timing change adds is a second kind of scrutiny: not just who can trade and how big, but how the reference price everyone's position is measured against gets set in the first place.\n\nSources: SEBI press release, \"Updated SEBI Study Reveals 93% of Individual Traders Incurred Losses in Equity F&O between FY22 and FY24\" (sebi.gov.in); Business Standard, \"Net losses of traders in F&O widens in FY25: Sebi study\" and \"Cash market turnover dipped, F&O growth remained sluggish in FY26\"; NSE circular dated 30 May 2026 on the Closing Auction Session and extended F&O timings; CFA Institute Market Integrity Insights, \"India's Derivatives Market and Retail Investors.\"";
const ARTICLE_CATEGORY = "market-talk";
const AUTHOR_NAME = "DeltaK";

const WELCOME_TITLE = "Welcome to Discuss";
const WELCOME_CATEGORY = "general";
const WELCOME_BODY = `This is the DeltaK community — a place to talk setups, read the tape together, and tell us what to fix or build next. A few things worth knowing before you jump in:

Anyone can read every thread here, no account needed. Signing in only matters the moment you want to post — a thread, a reply, or a report — because attribution is real: every post carries the account that wrote it, same as any other forum.

Four categories cover most of what belongs here. Strategy is for setups, adjustments, and the trade-offs between them. Market Talk is live index and sector discussion — what today's tape is actually doing, and the occasional deep-dive like the F&O timing-change writeup pinned there now. Feedback is bugs, rough edges, and what you want DeltaK to build next — we read every one. General is everything else worth a thread.

Long-form pieces get their own treatment now too — start a thread as a "Long article" instead of a discussion, and it renders as a proper write-up with its own reading layout, not a chat bubble, while still taking comments underneath.

One ground rule, stated once so it doesn't need repeating on every thread: nothing posted here is investment advice, including anything posted by this account. It's traders talking to traders. Trade accordingly.

Good to have you here.`;

async function postThread(uid, idToken, { category, title, body, postType, pinned }) {
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
      pinned,
      locked: false,
      postType,
    },
    idToken,
  );
  const threadId = threadDoc.name.split("/").pop();

  await firestoreCreate(
    `forumThreads/${threadId}/posts`,
    { body, authorUid: uid, authorName: AUTHOR_NAME, createdAt: now, editedAt: null, deletedAt: null },
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
  } else {
    console.log(`forumProfiles/${uid} already exists — leaving it as-is.`);
  }

  console.log("Posting the welcome thread...");
  const welcomeId = await postThread(uid, idToken, {
    category: WELCOME_CATEGORY,
    title: WELCOME_TITLE,
    body: WELCOME_BODY,
    postType: "discussion",
    pinned: true,
  });
  console.log(`  /discuss/${WELCOME_CATEGORY}/${welcomeId}`);

  console.log("Posting the F&O article...");
  const articleId = await postThread(uid, idToken, {
    category: ARTICLE_CATEGORY,
    title: ARTICLE_TITLE,
    body: ARTICLE_BODY,
    postType: "article",
    pinned: true,
  });
  console.log(`  /discuss/${ARTICLE_CATEGORY}/${articleId}`);

  console.log("\nDone. Both threads live once deployed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
