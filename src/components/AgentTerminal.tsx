"use client";

import { FormEvent, useMemo, useState } from "react";
import { Play, ReceiptText, RotateCcw } from "lucide-react";
import type { ServiceCatalogEntry } from "@/lib/services/catalog";

type CallState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; code: number; body: unknown }
  | { status: "error"; code: number; body: unknown };

const defaultTokenAddress = "0x779ded0c9e1022225f8e0630b35a9b54be713736";

function payloadTemplate(serviceId: string, tokenAddress = defaultTokenAddress) {
  const templates: Record<string, unknown> = {
    scan_xlayer_market: {
      strategy: "Find the strongest X Layer momentum opportunity from live market data",
      maxTokens: 10
    },
    score_token_opportunity: {
      tokenAddress,
      strategy: "Momentum with liquidity safety"
    },
    generate_trade_signal: {
      tokenAddress,
      agentName: "X-Alpha",
      strategy: "Momentum and liquidity rotation",
      riskProfile: "balanced",
      accountSizeUsd: 1000
    },
    risk_check_trade: {
      tokenAddress,
      side: "buy",
      notionalUsd: 250,
      maxSlippageBps: 100
    },
    simulate_strategy_nav: {
      startingNavUsd: 1000,
      cashUsd: 250,
      positions: [
        {
          tokenAddress,
          units: 10,
          costBasisUsd: 500
        }
      ]
    },
    generate_agent_update_post: {
      agentName: "X-Alpha",
      tokenAddress,
      decision: "watch",
      reason: "Liquidity is improving, but volatility is elevated.",
      includeHashtag: true
    }
  };

  return JSON.stringify(templates[serviceId], null, 2);
}

function extractTokenAddress(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if ("tokenAddress" in value && typeof value.tokenAddress === "string" && /^0x[a-fA-F0-9]{40}$/.test(value.tokenAddress)) {
    return value.tokenAddress;
  }

  if ("data" in value) {
    const token = extractTokenAddress(value.data);
    if (token) {
      return token;
    }
  }

  if ("ranked" in value && Array.isArray(value.ranked)) {
    for (const item of value.ranked) {
      const token = extractTokenAddress(item);
      if (token) {
        return token;
      }
    }
  }

  return undefined;
}

type AgentTerminalProps = {
  services: ServiceCatalogEntry[];
};

export function AgentTerminal({ services: serviceList }: AgentTerminalProps) {
  const services = useMemo(() => serviceList, [serviceList]);
  const [selectedService, setSelectedService] = useState<ServiceCatalogEntry>(services[0]);
  const [discoveredTokenAddress, setDiscoveredTokenAddress] = useState(defaultTokenAddress);
  const [payload, setPayload] = useState(payloadTemplate(services[0].id, defaultTokenAddress));
  const [paymentHeader, setPaymentHeader] = useState("");
  const [callState, setCallState] = useState<CallState>({ status: "idle" });

  function selectService(serviceId: string) {
    const nextService = services.find((service) => service.id === serviceId) ?? services[0];
    setSelectedService(nextService);
    setPayload(payloadTemplate(nextService.id, discoveredTokenAddress));
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
      const nextTokenAddress = extractTokenAddress(responseBody);

      if (nextTokenAddress) {
        setDiscoveredTokenAddress(nextTokenAddress);
      }

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
            <button type="button" onClick={() => setPayload(payloadTemplate(selectedService.id, discoveredTokenAddress))}>
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
