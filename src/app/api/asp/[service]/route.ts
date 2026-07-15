import { NextRequest, NextResponse } from "next/server";
import { paymentRequiredResponse, verifyPayment } from "@/lib/payment/x402";
import { executeService, formatServiceError } from "@/lib/services/executor";
import { isServiceId, serviceCatalog } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    service: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { service: serviceParam } = await context.params;

  if (!isServiceId(serviceParam)) {
    return NextResponse.json({ error: "unknown_service", service: serviceParam }, { status: 404 });
  }

  const service = serviceCatalog[serviceParam];
  const payment = await verifyPayment(request, service);

  if (!payment.ok) {
    if (payment.status === 402) {
      return paymentRequiredResponse(service);
    }

    return NextResponse.json(
      {
        error: "payment_verification_failed",
        message: payment.message,
        detail: payment.detail
      },
      { status: payment.status }
    );
  }

  const input = await request.json().catch(() => ({}));

  try {
    const result = await executeService(serviceParam, input);

    return NextResponse.json({
      ...result,
      settlement: payment.settlement
    });
  } catch (error) {
    return NextResponse.json(formatServiceError(error), { status: 400 });
  }
}
