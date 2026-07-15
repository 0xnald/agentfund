import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ServiceCatalogEntry } from "@/lib/services/catalog";

type PaymentVerification =
  | { ok: true; settlement?: unknown }
  | { ok: false; status: number; message: string; detail?: unknown };

export function paymentRequiredResponse(service: ServiceCatalogEntry) {
  return NextResponse.json(
    {
      error: "payment_required",
      message: "This AgentFund A2MCP service requires x402 payment before execution.",
      x402: {
        version: "1",
        network: env.X402_NETWORK,
        asset: env.X402_ASSET,
        receiver: env.X402_RECEIVER,
        amount: service.priceUsd,
        currency: "USD",
        service: service.id,
        description: service.description,
        paymentHeader: "X-PAYMENT"
      }
    },
    {
      status: 402,
      headers: {
        "X-AgentFund-Service": service.id,
        "X-Payment-Required": "x402"
      }
    }
  );
}

export async function verifyPayment(request: NextRequest, service: ServiceCatalogEntry): Promise<PaymentVerification> {
  const payment = request.headers.get("x-payment");

  if (env.AGENTFUND_PAYMENT_MODE === "disabled") {
    if (env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 500,
        message: "Payment bypass is not allowed in production."
      };
    }

    return { ok: true, settlement: { mode: "disabled-local-development" } };
  }

  if (!payment) {
    return {
      ok: false,
      status: 402,
      message: "Missing X-PAYMENT header."
    };
  }

  if (!env.OKX_PAYMENT_VERIFY_URL) {
    return {
      ok: false,
      status: 503,
      message: "OKX payment verification endpoint is not configured."
    };
  }

  const verification = await fetch(env.OKX_PAYMENT_VERIFY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.OKX_PAYMENT_API_KEY ? { authorization: `Bearer ${env.OKX_PAYMENT_API_KEY}` } : {})
    },
    body: JSON.stringify({
      payment,
      network: env.X402_NETWORK,
      asset: env.X402_ASSET,
      receiver: env.X402_RECEIVER,
      amount: service.priceUsd,
      currency: "USD",
      resource: new URL(request.url).pathname,
      serviceId: service.id
    })
  });

  const detail = await verification.json().catch(() => ({}));

  if (!verification.ok) {
    return {
      ok: false,
      status: verification.status,
      message: "OKX x402 payment verification failed.",
      detail
    };
  }

  return { ok: true, settlement: detail };
}
