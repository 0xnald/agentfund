import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { serviceCatalog } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

  return NextResponse.json({
    name: "AgentFund",
    version: "0.1.0",
    aspType: "A2MCP",
    description: "Paid strategy intelligence for autonomous finance agents on X Layer.",
    homepage: baseUrl,
    catalogUrl: `${baseUrl}/api/asp/catalog`,
    payment: {
      standard: "x402",
      network: env.X402_NETWORK,
      asset: env.X402_ASSET,
      receiver: env.X402_RECEIVER
    },
    chain: {
      id: env.NEXT_PUBLIC_AGENTFUND_CHAIN_ID,
      name: env.NEXT_PUBLIC_AGENTFUND_CHAIN_NAME,
      rpc: env.XLAYER_RPC_URL
    },
    services: Object.values(serviceCatalog).map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      method: service.method,
      endpoint: `${baseUrl}/api/asp/${service.id}`,
      priceUsd: service.priceUsd
    }))
  });
}
