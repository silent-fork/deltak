import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { readJson } from "@/lib/market/request";
import {
  MARGIN_BATCH_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/margin` — Angel One's batch margin calculator.
 *
 * What the broker will actually block for a basket, as opposed to what the
 * premium costs. For a long option they differ by the whole span/exposure
 * question, so sizing a trade against premium alone is sizing it against the
 * wrong number.
 *
 * Up to 50 legs per request, metered at 10 a second. As everywhere else here
 * the body is rebuilt field by field rather than forwarded — this call carries
 * the session JWT.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_POSITIONS = 50;

const EXCHANGES = ["BSE", "NSE", "NFO", "MCX", "BFO"];
const PRODUCT_TYPES = ["DELIVERY", "CARRYFORWARD", "MARGIN", "INTRADAY", "BO"];
const TRADE_TYPES = ["BUY", "SELL"];
const ORDER_TYPES = ["LIMIT", "MARKET", "STOPLOSS_LIMIT", "STOPLOSS_MARKET"];

const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Margin calculation requires a SmartAPI session." },
      { status: 401 },
    );
  }

  const raw = (await readJson(request)) as { positions?: unknown } | null;
  const input = Array.isArray(raw?.positions) ? raw.positions : null;
  if (!input?.length) {
    return NextResponse.json(
      { detail: "positions must be a non-empty array." },
      { status: 400 },
    );
  }
  if (input.length > MAX_POSITIONS) {
    return NextResponse.json(
      { detail: `At most ${MAX_POSITIONS} positions per request; got ${input.length}.` },
      { status: 400 },
    );
  }

  const positions = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      return NextResponse.json({ detail: "Each position must be an object." }, { status: 400 });
    }
    const p = entry as Record<string, unknown>;
    const exchange = String(p.exchange ?? "").toUpperCase();
    const productType = String(p.productType ?? "").toUpperCase();
    const tradeType = String(p.tradeType ?? "").toUpperCase();
    const orderType = String(p.orderType ?? "LIMIT").toUpperCase();
    const token = String(p.token ?? "").trim();
    const qty = Math.trunc(num(p.qty));

    if (!EXCHANGES.includes(exchange)) {
      return NextResponse.json(
        { detail: `exchange must be one of ${EXCHANGES.join(", ")}.` },
        { status: 400 },
      );
    }
    if (!PRODUCT_TYPES.includes(productType)) {
      return NextResponse.json(
        { detail: `productType must be one of ${PRODUCT_TYPES.join(", ")}.` },
        { status: 400 },
      );
    }
    if (!TRADE_TYPES.includes(tradeType)) {
      return NextResponse.json({ detail: "tradeType must be BUY or SELL." }, { status: 400 });
    }
    if (!ORDER_TYPES.includes(orderType)) {
      return NextResponse.json(
        { detail: `orderType must be one of ${ORDER_TYPES.join(", ")}.` },
        { status: 400 },
      );
    }
    if (!/^\d{1,12}$/.test(token)) {
      return NextResponse.json(
        { detail: "token must be a numeric scrip token." },
        { status: 400 },
      );
    }
    if (qty <= 0) {
      return NextResponse.json({ detail: "qty must be a positive integer." }, { status: 400 });
    }

    positions.push({
      exchange,
      qty,
      price: num(p.price),
      productType,
      token,
      tradeType,
      orderType,
    });
  }

  try {
    const data = await smartApiCall<Record<string, unknown>>(MARGIN_BATCH_URL, {
      method: "POST",
      body: { positions },
      jwt: session.jwtToken,
    });
    const components = (data.marginComponents ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      positions: positions.length,
      margin: {
        total: num(data.totalMarginRequired),
        net_premium: num(components.netPremium),
        span: num(components.spanMargin),
        benefit: num(components.marginBenefit),
        delivery: num(components.deliveryMargin),
        non_fo: num(components.nonNFOMargin),
        options_premium: num(components.totOptionsPremium),
      },
    });
  } catch (err) {
    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Margin calculation failed." },
      { status },
    );
  }
}
