import { NextRequest, NextResponse } from "next/server";
import { paymentRequiredResponse, verifyPayment } from "@/lib/payment/x402";
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

  return NextResponse.json(
    {
      error: "service_not_implemented",
      message: `${service.id} is registered in the ASP catalog. The service executor will be added in the next build commit.`,
      settlement: payment.settlement
    },
    { status: 501 }
  );
}
