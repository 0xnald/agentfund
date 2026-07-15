import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { serviceCatalog } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: "AgentFund",
    type: "A2MCP",
    chain: {
      id: env.NEXT_PUBLIC_AGENTFUND_CHAIN_ID,
      name: env.NEXT_PUBLIC_AGENTFUND_CHAIN_NAME
    },
    receiver: env.NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS,
    services: Object.values(serviceCatalog)
  });
}
