import { NextRequest, NextResponse } from "next/server";
import { withAgentFundX402 } from "@/lib/payment/x402";
import { executeService, formatServiceError } from "@/lib/services/executor";
import { isServiceId, serviceCatalog } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

async function handler(request: NextRequest) {
  const serviceParam = request.nextUrl.pathname.split("/").filter(Boolean).at(-1) ?? "";

  if (!isServiceId(serviceParam)) {
    return NextResponse.json({ error: "unknown_service", service: serviceParam }, { status: 404 });
  }

  const service = serviceCatalog[serviceParam];
  const input = await request.json().catch(() => ({}));

  try {
    const result = await executeService(serviceParam, input);

    return NextResponse.json({
      ...result,
      billing: {
        mode: "okx_x402",
        service: service.id,
        priceUsd: service.priceUsd
      }
    });
  } catch (error) {
    return NextResponse.json(formatServiceError(error), { status: 400 });
  }
}

export const POST = withAgentFundX402(handler);
