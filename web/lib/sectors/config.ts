/**
 * NSE sector universe for the public F&O rotation dashboard.
 *
 * `bhavcopyName` must match `Index Name` exactly as `nse.indicesBhavcopy()`
 * spells it (confirmed live against a real bhavcopy pull, 2026-08-03) —
 * that CSV is the only source with a genuine daily series per sector, so
 * the whole rotation depends on this string being right.
 *
 * `constituentSlug` is the `ind_{slug}.csv` file on niftyindices.com (NSE's
 * own index-methodology site, a different domain from nseindia.com and not
 * wrapped by `nse-bse-api` at all — that package's own
 * `listEquityStocksByIndex` is a dead endpoint, confirmed via a direct,
 * unauthenticated curl returning a genuine 404, not a package bug). `null`
 * means the constituent list is not available: nse-bse-api can still put
 * the sector on the RRG (that only needs the bhavcopy close), but the
 * dashboard cannot drill into its stocks or suggest F&O picks from it. Every
 * slug below was checked for real CSV content, not just a 200 status —
 * niftyindices.com returns 200 with an HTML "Error 404" body for a wrong
 * slug, which a status-code-only check would misread as success.
 */
export interface SectorSpec {
  bhavcopyName: string;
  label: string;
  constituentSlug: string | null;
}

export const BENCHMARK_BHAVCOPY_NAME = "Nifty 50";

export const SECTORS: SectorSpec[] = [
  { bhavcopyName: "Nifty Auto", label: "Auto", constituentSlug: "niftyautolist" },
  { bhavcopyName: "Nifty Bank", label: "Bank", constituentSlug: "niftybanklist" },
  { bhavcopyName: "Nifty Financial Services", label: "Financial Services", constituentSlug: null },
  { bhavcopyName: "Nifty FMCG", label: "FMCG", constituentSlug: "niftyfmcglist" },
  { bhavcopyName: "Nifty IT", label: "IT", constituentSlug: "niftyitlist" },
  { bhavcopyName: "Nifty Media", label: "Media", constituentSlug: "niftymedialist" },
  { bhavcopyName: "Nifty Metal", label: "Metal", constituentSlug: "niftymetallist" },
  { bhavcopyName: "Nifty Pharma", label: "Pharma", constituentSlug: "niftypharmalist" },
  { bhavcopyName: "Nifty PSU Bank", label: "PSU Bank", constituentSlug: "niftypsubanklist" },
  { bhavcopyName: "Nifty Private Bank", label: "Private Bank", constituentSlug: null },
  { bhavcopyName: "Nifty Realty", label: "Realty", constituentSlug: "niftyrealtylist" },
  { bhavcopyName: "Nifty Infrastructure", label: "Infrastructure", constituentSlug: null },
  { bhavcopyName: "Nifty Oil & Gas", label: "Oil & Gas", constituentSlug: "niftyoilgaslist" },
  { bhavcopyName: "Nifty Healthcare Index", label: "Healthcare", constituentSlug: "niftyhealthcarelist" },
  { bhavcopyName: "Nifty Consumer Durables", label: "Consumer Durables", constituentSlug: "niftyconsumerdurableslist" },
  { bhavcopyName: "Nifty Chemicals", label: "Chemicals", constituentSlug: null },
  { bhavcopyName: "Nifty Cement", label: "Cement", constituentSlug: null },
  { bhavcopyName: "Nifty Capital Goods", label: "Capital Goods", constituentSlug: null },
  { bhavcopyName: "Nifty Energy", label: "Energy", constituentSlug: "niftyenergylist" },
];
