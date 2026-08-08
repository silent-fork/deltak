import { NextRequest, NextResponse } from "next/server";

import manifest from "./data/manifest.json";
import trades100000 from "./data/trades_100000.json";
import trades25000 from "./data/trades_25000.json";
import trades50000 from "./data/trades_50000.json";

/**
 * The backtest report's downloadable trade ledgers, generated on request
 * rather than shipped as static files under public/ — the same trade data
 * (backtest/export_trades.py's output, copied into ./data/ at build time,
 * never sent to the client directly) formatted to whichever of CSV/JSON a
 * request asks for. One route, one source of truth, instead of a
 * pre-baked file per format per tier.
 */

export const runtime = "nodejs";

type Trade = {
  day: string;
  underlying: string;
  protocol: string;
  opt: string;
  strike: number;
  lots: number;
  entry: number;
  stop: number | null;
  target: number | null;
  exit_price: number;
  action: string;
  entry_charge: number;
  exit_charge: number;
  net: number;
};

const TIERS = {
  "100000": trades100000 as { summary: unknown; trades: Trade[] },
  "50000": trades50000 as { summary: unknown; trades: Trade[] },
  "25000": trades25000 as { summary: unknown; trades: Trade[] },
} as const;

const CSV_FIELDS: (keyof Trade)[] = [
  "day", "underlying", "protocol", "opt", "strike", "lots",
  "entry", "stop", "target", "exit_price", "action",
  "entry_charge", "exit_charge", "net",
];

const MONEY_FIELDS = new Set<keyof Trade>(["entry", "stop", "target", "exit_price", "entry_charge", "exit_charge", "net"]);

function csvEscape(v: unknown, field?: keyof Trade): string {
  const rounded = typeof v === "number" && field && MONEY_FIELDS.has(field) ? Math.round(v * 100) / 100 : v;
  const s = rounded === null || rounded === undefined ? "" : String(rounded);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function tradesToCsv(trades: Trade[]): string {
  const header = CSV_FIELDS.join(",");
  const rows = trades.map((t) => CSV_FIELDS.map((f) => csvEscape(t[f], f)).join(","));
  return [header, ...rows].join("\n");
}

function attributionCsv(): string {
  const header = "tier,starting_capital,risk_pct,breakdown_type,key,trades,win_rate,net_pnl";
  const rows: string[] = [];
  type ManifestTier = {
    label: string; starting_capital: number; risk_pct: number;
    by_index: { underlying: string; trades: number; win_rate: number; net_pnl: number }[];
    by_protocol: { protocol: string; trades: number; win_rate: number; net_pnl: number }[];
    by_exit_reason: { action: string; trades: number; win_rate: number; net_pnl: number }[];
  };
  for (const tier of manifest as ManifestTier[]) {
    for (const r of tier.by_index) {
      rows.push([tier.label, tier.starting_capital, tier.risk_pct, "index", r.underlying, r.trades, r.win_rate, r.net_pnl].map((v) => csvEscape(v)).join(","));
    }
    for (const r of tier.by_protocol) {
      rows.push([tier.label, tier.starting_capital, tier.risk_pct, "protocol", r.protocol, r.trades, r.win_rate, r.net_pnl].map((v) => csvEscape(v)).join(","));
    }
    for (const r of tier.by_exit_reason) {
      rows.push([tier.label, tier.starting_capital, tier.risk_pct, "exit_reason", r.action, r.trades, r.win_rate, r.net_pnl].map((v) => csvEscape(v)).join(","));
    }
  }
  return [header, ...rows].join("\n");
}

function fileResponse(body: string, filename: string, contentType: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");

  if (file === "attribution-summary") {
    return fileResponse(attributionCsv(), "deltak-attribution-summary.csv", "text/csv; charset=utf-8");
  }

  if (file === "full-export") {
    const bundle = Object.values(TIERS);
    return fileResponse(JSON.stringify(bundle, null, 2), "deltak-backtest-full-export.json", "application/json; charset=utf-8");
  }

  const tierMatch = file?.match(/^ledger-(100000|50000|25000)$/);
  if (tierMatch) {
    const slug = tierMatch[1] as keyof typeof TIERS;
    const tier = TIERS[slug];
    return fileResponse(tradesToCsv(tier.trades), `deltak-trade-ledger-${slug}.csv`, "text/csv; charset=utf-8");
  }

  return NextResponse.json(
    { detail: "Unknown ?file= — expected ledger-100000|ledger-50000|ledger-25000|attribution-summary|full-export" },
    { status: 400 },
  );
}
