import "server-only";

/**
 * NSE's own official sector-constituent lists, from niftyindices.com — a
 * different domain from nseindia.com and not wrapped by `nse-bse-api` at
 * all (see the long comment on `SectorSpec.constituentSlug` in `config.ts`
 * for why: the npm package's own `listEquityStocksByIndex` is a dead
 * endpoint).
 *
 * niftyindices.com returns HTTP 200 with an HTML "Error 404" body for an
 * invalid slug — a status-code check alone cannot tell success from
 * failure, so this always inspects the body itself.
 */
export interface Constituent {
  symbol: string;
  company: string;
  industry: string;
}

const BASE = "https://niftyindices.com/IndexConstituent/ind_";
const UA = "Mozilla/5.0 (compatible; DeltaK/1.0)";

interface CacheEntry {
  at: number;
  value: Constituent[];
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 6 * 60 * 60_000;

export async function fetchConstituents(slug: string): Promise<Constituent[]> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const res = await fetch(`${BASE}${slug}.csv`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok || text.trim().startsWith("<")) {
    throw new Error(`niftyindices constituent list unavailable for "${slug}"`);
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0]?.split(",") ?? [];
  const nameIdx = header.indexOf("Company Name");
  const industryIdx = header.indexOf("Industry");
  const symbolIdx = header.indexOf("Symbol");
  if (symbolIdx < 0) throw new Error(`unexpected constituent CSV shape for "${slug}"`);

  const rows: Constituent[] = lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      symbol: cols[symbolIdx]?.trim() ?? "",
      company: cols[nameIdx]?.trim() ?? "",
      industry: cols[industryIdx]?.trim() ?? "",
    };
  }).filter((c) => c.symbol.length > 0);

  cache.set(slug, { at: Date.now(), value: rows });
  return rows;
}
