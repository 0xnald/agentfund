import { NextRequest, NextResponse } from "next/server";
import type { Network, RouteConfig } from "@okxweb3/x402-next";
import { env } from "@/lib/env";
import { isServiceId, serviceCatalog } from "@/lib/services/catalog";

type PaidHandler = (request: NextRequest) => Promise<NextResponse<unknown>>;
const x402Network = env.X402_NETWORK as Network;

function noStore(response: NextResponse<unknown>) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function serviceFromPath(path: string) {
  const service = path.split("/").filter(Boolean).at(-1);
  return service && isServiceId(service) ? service : undefined;
}

function priceForPath(path: string) {
  const service = serviceFromPath(path);
  return service ? `$${serviceCatalog[service].priceUsd}` : "$0.10";
}

export const paymentMetadata = {
  standard: "x402",
  scheme: "exact",
  network: x402Network,
  asset: env.X402_ASSET,
  assetSymbol: env.X402_ASSET_SYMBOL,
  receiver: env.X402_RECEIVER,
  header: "PAYMENT",
  responseHeader: "PAYMENT-RESPONSE",
  maxTimeoutSeconds: 300
};

export const agentFundRouteConfig: RouteConfig = {
  accepts: {
    scheme: paymentMetadata.scheme,
    network: x402Network,
    payTo: env.X402_RECEIVER,
    price: (context) => priceForPath(context.path),
    maxTimeoutSeconds: paymentMetadata.maxTimeoutSeconds
  },
  description: "AgentFund paid strategy intelligence service for OKX.AI agents.",
  mimeType: "application/json",
  unpaidResponseBody: (context) => ({
    contentType: "application/json",
    body: {
      error: "payment_required",
      message: "AgentFund requires an OKX x402 payment before executing this ASP service.",
      service: serviceFromPath(context.path),
      payment: {
        ...paymentMetadata,
        price: priceForPath(context.path)
      }
    }
  }),
  settlementFailedResponseBody: (_context, settlement) => ({
    contentType: "application/json",
    body: {
      error: "payment_settlement_failed",
      settlement
    }
  })
};

async function buildWrappedHandler(handler: PaidHandler) {
  const [{ OKXFacilitatorClient }, { withX402, x402ResourceServer }, { ExactEvmScheme }] = await Promise.all([
    import("@okxweb3/x402-core"),
    import("@okxweb3/x402-next"),
    import("@okxweb3/x402-evm/exact/server")
  ]);

  const facilitatorClient = new OKXFacilitatorClient({
    apiKey: env.OKX_API_KEY,
    secretKey: env.OKX_SECRET_KEY,
    passphrase: env.OKX_PASSPHRASE,
    baseUrl: env.OKX_BASE_URL,
    syncSettle: env.OKX_SYNC_SETTLE
  });

  const resourceServer = new x402ResourceServer(facilitatorClient).register(x402Network, new ExactEvmScheme());
  return withX402(handler, agentFundRouteConfig, resourceServer);
}

let wrappedHandler: ((request: NextRequest) => Promise<NextResponse<unknown>>) | undefined;

export function withAgentFundX402(handler: PaidHandler) {
  if (env.AGENTFUND_PAYMENT_MODE === "disabled") {
    return async (request: NextRequest) => {
      const isLocalRequest = ["localhost", "127.0.0.1", "::1"].includes(request.nextUrl.hostname);

      if (env.NODE_ENV === "production" && !isLocalRequest) {
        return NextResponse.json(
          {
            error: "payment_bypass_not_allowed",
            message: "AGENTFUND_PAYMENT_MODE=disabled is only allowed for localhost testing."
          },
          { status: 500 }
        );
      }

      return noStore(await handler(request));
    };
  }

  return async (request: NextRequest) => {
    wrappedHandler ??= await buildWrappedHandler(handler);
    return noStore(await wrappedHandler(request));
  };
}
