import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getMarketSnapshot } from "@/lib/market/snapshot";

export const dynamic = "force-dynamic";

async function refresh(request: NextRequest) {
  const requestedMaxTokens = Number(request.nextUrl.searchParams.get("maxTokens") ?? env.AGENTFUND_MARKET_CACHE_MAX_TOKENS);
  const snapshot = await getMarketSnapshot({
    maxTokens:
      Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0
        ? Math.min(Math.floor(requestedMaxTokens), 50)
        : undefined,
    forceRefresh: true
  });

  return NextResponse.json({
    ok: true,
    ...snapshot
  });
}

export const GET = refresh;
export const POST = refresh;
