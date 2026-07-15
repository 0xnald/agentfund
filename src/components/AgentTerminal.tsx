"use client";

import { FormEvent, useMemo, useState } from "react";
import { Play, ReceiptText, RotateCcw } from "lucide-react";
import type { ServiceCatalogEntry } from "@/lib/services/catalog";

type CallState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; code: number; body: unknown }
  | { status: "error"; code: number; body: unknown };

const payloadTemplates: Record<string, string> = {
  scan_xlayer_market: JSON.stringify(
    {
      strategy: "Find the strongest X Layer momentum opportunity from live market data",
      maxTokens: 10
    },
    null,
    2
  ),
  score_token_opportunity: JSON.stringify(
    {
      tokenAddress: "0x...",
      strategy: "Momentum with liquidity safety"
    },
    null,
    2
  ),
  generate_trade_signal: JSON.stringify(
    {
      tokenAddress: "0x...",
      agentName: "X-Alpha",
      strategy: "Momentum and liquidity rotation",
      riskProfile: "balanced",
      accountSizeUsd: 1000
    },
    null,
    2
  ),
  risk_check_trade: JSON.stringify(
    {
      tokenAddress: "0x...",
      side: "buy",
      notionalUsd: 250,
      maxSlippageBps: 100
    },
    null,
    2
  ),
  simulate_strategy_nav: JSON.stringify(
    {
      startingNavUsd: 1000,
      cashUsd: 250,
      positions: [
        {
          tokenAddress: "0x...",
          units: 10,
          costBasisUsd: 500
        }
      ]
    },
    null,
    2
  ),
  generate_agent_update_post: JSON.stringify(
    {
      agentName: "X-Alpha",
      tokenAddress: "0x...",
      decision: "watch",
      reason: "Liquidity is improving, but volatility is elevated.",
      includeHashtag: true
    },
    null,
    2
  )
};

type AgentTerminalProps = {
  services: ServiceCatalogEntry[];
};

export function AgentTerminal({ services: serviceList }: AgentTerminalProps) {
  const services = useMemo(() => serviceList, [serviceList]);
  const [selectedService, setSelectedService] = useState<ServiceCatalogEntry>(services[0]);
  const [payload, setPayload] = useState(payloadTemplates[services[0].id]);
  const [paymentHeader, setPaymentHeader] = useState("");
  const [callState, setCallState] = useState<CallState>({ status: "idle" });

  function selectService(serviceId: string) {
    const nextService = services.find((service) => service.id === serviceId) ?? services[0];
    setSelectedService(nextService);
    setPayload(payloadTemplates[nextService.id]);
    setCallState({ status: "idle" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCallState({ status: "loading" });

    let body: unknown;

    try {
      body = JSON.parse(payload);
    } catch (error) {
      setCallState({
        status: "error",
        code: 0,
        body: {
          error: "invalid_json",
          message: error instanceof Error ? error.message : "Payload is not valid JSON."
        }
      });
      return;
    }

    try {
      const response = await fetch(`/api/asp/${selectedService.id}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(paymentHeader ? { payment: paymentHeader } : {})
        },
        body: JSON.stringify(body)
      });

      const responseBody = await response.json().catch(() => ({}));

      setCallState({
        status: response.ok ? "success" : "error",
        code: response.status,
        body: responseBody
      });
    } catch (error) {
      setCallState({
        status: "error",
        code: 0,
        body: {
          error: "request_failed",
          message: error instanceof Error ? error.message : "Unknown request failure."
        }
      });
    }
  }

  const responseBody =
    callState.status === "idle"
      ? "Waiting for a service call."
      : callState.status === "loading"
        ? "Calling AgentFund ASP service..."
        : JSON.stringify(callState.body, null, 2);

  return (
    <section className="terminal" id="terminal">
      <div className="terminalHeader">
        <div>
          <p className="eyebrow">Live ASP Console</p>
          <h2>Call AgentFund Services</h2>
        </div>
        <span>{selectedService.priceUsd} USD / call</span>
      </div>

      <form className="terminalGrid" onSubmit={submit}>
        <div className="controls">
          <label>
            Service
            <select value={selectedService.id} onChange={(event) => selectService(event.target.value)}>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            PAYMENT Header
            <input
              placeholder="Paste OKX.AI x402 PAYMENT payload"
              value={paymentHeader}
              onChange={(event) => setPaymentHeader(event.target.value)}
            />
          </label>

          <p>{selectedService.description}</p>

          <div className="terminalActions">
            <button type="submit" disabled={callState.status === "loading"}>
              <Play aria-hidden />
              {callState.status === "loading" ? "Calling" : "Call Service"}
            </button>
            <button type="button" onClick={() => setPayload(payloadTemplates[selectedService.id])}>
              <RotateCcw aria-hidden />
              Reset Payload
            </button>
            <a href="/api/asp/catalog" target="_blank" rel="noreferrer">
              <ReceiptText aria-hidden />
              Catalog
            </a>
            <a href="/api/asp/manifest" target="_blank" rel="noreferrer">
              <ReceiptText aria-hidden />
              Manifest
            </a>
          </div>
        </div>

        <label className="payloadEditor">
          Request JSON
          <textarea value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} />
        </label>
      </form>

      <div className={`response ${callState.status}`}>
        <div>
          <span>Response</span>
          <strong>{callState.status === "idle" ? "ready" : callState.status}</strong>
          {"code" in callState ? <em>HTTP {callState.code}</em> : null}
        </div>
        <pre>{responseBody}</pre>
      </div>
    </section>
  );
}
