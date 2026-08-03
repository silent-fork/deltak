import { INDEX_UNIVERSE } from "@/lib/engine/config";

export interface IndexProfile {
  slug: string;
  name: string;
  exchange: "NSE" | "BSE";
  description: string;
  tradingNotes: string[];
  tradedByDeltaK: boolean;
  /** Null when the figure is revised often enough by the exchange that printing a number here would risk going stale. */
  lotSize: number | null;
  strikeStep: number | null;
  specNote: string;
  keywords: string[];
}

/**
 * The five DeltaK actually trades get exact, live-config-sourced lot size
 * and strike step (INDEX_UNIVERSE — the same constants the engine runs on;
 * BANKEX and SENSEX run on BSE's cash/F&O segments rather than NSE's, same
 * as the terminal itself does under the hood). MidCap Nifty is a real,
 * heavily-traded contract this wiki should still cover for anyone comparing
 * across the whole Indian F&O landscape, but DeltaK doesn't trade it yet and
 * its lot size gets revised by exchange circular often enough that
 * hardcoding a number here would go stale — it points to the live contract
 * note instead of printing a figure.
 */
export const INDICES: IndexProfile[] = [
  {
    slug: "nifty",
    name: INDEX_UNIVERSE.NIFTY.label,
    exchange: "NSE",
    description:
      "NSE's flagship broad-market index of the 50 largest, most liquid listed Indian companies by free-float market cap, across sectors. The single most-traded index options contract in the world by volume for several years running.",
    tradingNotes: [
      "Sitting across the largest names in every major sector rather than concentrated in one, NIFTY's realized volatility tends to run lower than BANKNIFTY's — a single sector's earnings surprise or rate-policy reaction rarely moves the whole 50-stock basket as hard as it moves a bank-only index.",
      "That lower volatility is exactly why NIFTY is the more common home for defined-risk, range-bound structures like iron condors and iron butterflies — the wider basket smooths out single-stock noise, which tends to make wall migration (Aegis, Zenith) a cleaner signal than it is on a narrower, more sector-concentrated index.",
      "Being the deepest and most liquid contract on the exchange also means the tightest bid-ask spreads on the chain — a real, quantifiable cost saving for any strategy that involves several legs, since each leg's slippage compounds across the position.",
    ],
    tradedByDeltaK: true,
    lotSize: INDEX_UNIVERSE.NIFTY.lotSize,
    strikeStep: INDEX_UNIVERSE.NIFTY.strikeStep,
    specNote:
      "Lot size and strike step are read from DeltaK's own live engine configuration, the same constants the terminal trades against.",
    keywords: ["nifty 50 options", "nifty lot size", "nifty options trading india"],
  },
  {
    slug: "banknifty",
    name: INDEX_UNIVERSE.BANKNIFTY.label,
    exchange: "NSE",
    description:
      "NSE's benchmark for the Indian banking sector — the most liquid private and public sector banks by free-float market cap. Historically the more volatile of NSE's two most-traded index contracts, given how concentrated bank earnings and rate-policy sensitivity are inside a single sector bet.",
    tradingNotes: [
      "Concentration cuts both ways here: a handful of large private banks carry outsized weight, so a single stock's results day or a surprise RBI rate move can shift the whole index far harder than the same news would move NIFTY's broader 50-stock spread.",
      "That higher realized volatility is why BANKNIFTY premium tends to run richer at the same relative distance from spot than NIFTY's — good for strategies built around selling premium (short strangles, iron condors) when a range genuinely holds, and correspondingly more punishing when it doesn't.",
      "Wall migration tends to be sharper and faster here than on NIFTY — Aegis and Zenith can shift a full strike or two in a single volatile session around a policy event, which is exactly the kind of regime DeltaK's Protocol Delta (Volatility Trap) is built to recognize and stand aside from rather than force a read.",
    ],
    tradedByDeltaK: true,
    lotSize: INDEX_UNIVERSE.BANKNIFTY.lotSize,
    strikeStep: INDEX_UNIVERSE.BANKNIFTY.strikeStep,
    specNote:
      "Lot size and strike step are read from DeltaK's own live engine configuration, the same constants the terminal trades against.",
    keywords: ["banknifty options", "banknifty lot size", "banknifty options trading india"],
  },
  {
    slug: "finnifty",
    name: INDEX_UNIVERSE.FINNIFTY.label,
    exchange: "NSE",
    description:
      "NSE's broader financial-services index — banks plus NBFCs, insurers, housing finance and capital-markets companies, a wider sector bet than Bank Nifty alone.",
    tradingNotes: [
      "Sitting between NIFTY and BANKNIFTY in composition, FINNIFTY typically sits between them in realized volatility too — narrower than the full 50-stock NIFTY basket, but diluted relative to BANKNIFTY's bank-only concentration by the NBFC, insurance and capital-markets names mixed in.",
      "Open interest and volume here are meaningfully thinner than on NIFTY or BANKNIFTY, which shows up directly as wider bid-ask spreads on far-OTM strikes — a real cost to account for on any multi-leg structure, since a wide spread on even one leg can eat into a spread's entire theoretical edge.",
      "Because financial-services names collectively react to the same rate-policy and credit-cycle catalysts as banks, FINNIFTY's wall migration often (not always) tracks BANKNIFTY's own — worth cross-checking one against the other before treating either signal as fully independent.",
    ],
    tradedByDeltaK: true,
    lotSize: INDEX_UNIVERSE.FINNIFTY.lotSize,
    strikeStep: INDEX_UNIVERSE.FINNIFTY.strikeStep,
    specNote:
      "Lot size and strike step are read from DeltaK's own live engine configuration, the same constants the terminal trades against.",
    keywords: ["finnifty options", "finnifty lot size", "finnifty options trading india"],
  },
  {
    slug: "midcpnifty",
    name: "Nifty Midcap Select (MIDCPNIFTY)",
    exchange: "NSE",
    description:
      "NSE's midcap-focused index contract, tracking a selection of liquid midcap companies rather than the broad-market or large-cap names NIFTY covers. Generally carries higher realized volatility than NIFTY given the midcap universe underneath it.",
    tradingNotes: [
      "Midcap names as a group tend to move harder than large-caps on both the way up and the way down, which shows up in MIDCPNIFTY as richer premium at a given distance from spot than the equivalent NIFTY strike — more expensive to buy options on, more compensated to sell them on, in either direction.",
      "Liquidity is a real practical constraint here relative to NIFTY or BANKNIFTY — thinner open interest away from the money means wider spreads and shallower depth, worth checking directly on the live chain before assuming a strategy built for NIFTY's liquidity will execute the same way here.",
    ],
    tradedByDeltaK: false,
    lotSize: null,
    strikeStep: null,
    specNote:
      "Not currently traded by DeltaK. NSE has revised this contract's lot size more than once as part of SEBI's periodic notional-value rationalization — check NSE's current contract specifications before sizing a position rather than relying on a figure printed here.",
    keywords: ["midcpnifty options", "midcap nifty options india", "midcpnifty lot size"],
  },
  {
    slug: "sensex",
    name: "BSE Sensex",
    exchange: "BSE",
    description:
      "BSE's flagship 30-stock benchmark index, the exchange's answer to NIFTY 50 — India's oldest stock market index, tracking large, established companies across sectors.",
    tradingNotes: [
      "With only 30 constituents against NIFTY's 50, Sensex is a narrower large-cap basket — in practice its moves track NIFTY closely most sessions, since the two indices share many of the same heavyweight names, though the smaller constituent count means any single name's move carries more relative weight here than in NIFTY.",
      "Options liquidity on Sensex has historically run well behind NIFTY's, concentrated more heavily in the weekly, near-the-money strikes around expiry — a real consideration for anyone used to NIFTY's depth further out on the chain.",
    ],
    tradedByDeltaK: true,
    lotSize: INDEX_UNIVERSE.SENSEX.lotSize,
    strikeStep: INDEX_UNIVERSE.SENSEX.strikeStep,
    specNote:
      "Lot size and strike step are read from DeltaK's own live engine configuration, the same constants the terminal trades against.",
    keywords: ["sensex options trading", "sensex lot size", "bse sensex options india"],
  },
  {
    slug: "bankex",
    name: "BSE Bankex",
    exchange: "BSE",
    description:
      "BSE's banking-sector index, the exchange's counterpart to Bank Nifty — a narrower, bank-focused alternative to the broad Sensex.",
    tradingNotes: [
      "Shares the same sector-concentration character as BANKNIFTY — a handful of large banks carrying outsized weight, so the same earnings-day and rate-policy sensitivity that makes BANKNIFTY the more volatile of NSE's two flagships applies here on the BSE side too.",
      "As the less-traded of BSE's two index contracts, Bankex liquidity sits behind both Sensex and NIFTY/BANKNIFTY — worth confirming actual depth on the live chain rather than assuming NSE-level liquidity carries over.",
    ],
    tradedByDeltaK: true,
    lotSize: INDEX_UNIVERSE.BANKEX.lotSize,
    strikeStep: INDEX_UNIVERSE.BANKEX.strikeStep,
    specNote:
      "Lot size and strike step are read from DeltaK's own live engine configuration, the same constants the terminal trades against.",
    keywords: ["bankex options trading", "bankex lot size", "bse bankex options india"],
  },
];

export function getIndex(slug: string): IndexProfile | undefined {
  return INDICES.find((i) => i.slug === slug);
}
