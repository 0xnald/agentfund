import { NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/market/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getMarketSnapshot();

  return NextResponse.json({
    ok: true,
    ...snapshot
  });
}
