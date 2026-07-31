import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  PLACE_ORDER_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/order` — Angel One placeOrder.
 *
 * The order-placing JWT is read from the httpOnly cookie, never from the request
 * body, so a compromised page script cannot trade with a token it stole: it has
 * no token to steal.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_TYPE = process.env.DK_PRODUCT_TYPE ?? "INTRADAY";

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Live orders require an active SmartAPI session." },
      { status: 401 },
    );
  }

  let body: {
    trading_symbol?: string;
    symbol_token?: string;
    transaction_type?: string;
    quantity?: number;
    order_type?: string;
    price?: number;
    exchange?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Malformed request body." }, { status: 400 });
  }

  const quantity = Number(body.quantity ?? 0);
  const side = (body.transaction_type ?? "").toUpperCase();
  if (!body.trading_symbol || !body.symbol_token || quantity <= 0) {
    return NextResponse.json(
      { detail: "trading_symbol, symbol_token and a positive quantity are required." },
      { status: 400 },
    );
  }
  if (side !== "BUY" && side !== "SELL") {
    return NextResponse.json({ detail: "transaction_type must be BUY or SELL." }, { status: 400 });
  }

  const orderType = (body.order_type ?? "MARKET").toUpperCase();
  const price = orderType === "LIMIT" ? Number(body.price ?? 0) : 0;

  try {
    const data = await smartApiCall<{ orderid?: string; uniqueorderid?: string }>(
      PLACE_ORDER_URL,
      {
        method: "POST",
        jwt: session.jwtToken,
        body: {
          variety: "NORMAL",
          tradingsymbol: body.trading_symbol,
          symboltoken: String(body.symbol_token),
          transactiontype: side,
          exchange: body.exchange ?? "NFO",
          ordertype: orderType,
          producttype: PRODUCT_TYPE,
          duration: "DAY",
          price: price.toFixed(2),
          squareoff: "0",
          stoploss: "0",
          quantity: String(Math.trunc(quantity)),
        },
      },
    );

    return NextResponse.json({
      ok: true,
      order_id: data.orderid ?? data.uniqueorderid ?? null,
      quantity: Math.trunc(quantity),
    });
  } catch (err) {
    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Order rejected." },
      { status },
    );
  }
}
