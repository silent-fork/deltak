import { INDEX_UNIVERSE } from "@/lib/engine/config";

export interface IndexProfile {
  slug: string;
  name: string;
  exchange: "NSE" | "BSE";
  description: string;
  tradedByDeltaK: boolean;
  /** Null when the figure is revised often enough by the exchange that printing a number here would risk going stale. */
  lotSize: number | null;
  strikeStep: number | null;
  specNote: string;
  keywords: string[];
}

/**
 * The three DeltaK actually trades get exact, live-config-sourced lot size
 * and strike step (INDEX_UNIVERSE — the same constants the engine runs on).
 * MidCap Nifty, Sensex and Bankex are real, heavily-traded contracts this
 * wiki should still cover for anyone comparing across the whole Indian F&O
 * landscape, but their lot sizes get revised by exchange circular often
 * enough that hardcoding a number here would go stale — those three point
 * to the live contract note instead of printing a figure.
 */
export const INDICES: IndexProfile[] = [
  {
    slug: "nifty",
    name: INDEX_UNIVERSE.NIFTY.label,
    exchange: "NSE",
    description:
      "NSE's flagship broad-market index of the 50 largest, most liquid listed Indian companies by free-float market cap, across sectors. The single most-traded index options contract in the world by volume for several years running.",
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
    tradedByDeltaK: false,
    lotSize: null,
    strikeStep: null,
    specNote:
      "Not currently traded by DeltaK. BSE has revised the Sensex contract's lot size as part of the same SEBI notional-value rationalization that's affected NSE contracts — check BSE's current contract specifications before sizing a position rather than relying on a figure printed here.",
    keywords: ["sensex options trading", "sensex lot size", "bse sensex options india"],
  },
  {
    slug: "bankex",
    name: "BSE Bankex",
    exchange: "BSE",
    description:
      "BSE's banking-sector index, the exchange's counterpart to Bank Nifty — a narrower, bank-focused alternative to the broad Sensex.",
    tradedByDeltaK: false,
    lotSize: null,
    strikeStep: null,
    specNote:
      "Not currently traded by DeltaK. Check BSE's current contract specifications for the live lot size and strike interval rather than relying on a figure printed here.",
    keywords: ["bankex options trading", "bankex lot size", "bse bankex options india"],
  },
];

export function getIndex(slug: string): IndexProfile | undefined {
  return INDICES.find((i) => i.slug === slug);
}
