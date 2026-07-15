import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { paymentMetadata } from "@/lib/payment/x402";
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
      ...paymentMetadata,
      supportedTokens: [
        {
          symbol: "USD₮0",
          address: "0x779ded0c9e1022225f8e0630b35a9b54be713736"
        },
        {
          symbol: "USDG",
          address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8"
        }
      ]
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
