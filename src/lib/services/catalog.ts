import { env } from "@/lib/env";

export const serviceIds = [
  "scan_xlayer_market",
  "score_token_opportunity",
  "generate_trade_signal",
  "risk_check_trade",
  "simulate_strategy_nav",
  "generate_agent_update_post"
] as const;

export type ServiceId = (typeof serviceIds)[number];

export type ServiceCatalogEntry = {
  id: ServiceId;
  name: string;
  description: string;
  priceUsd: string;
  method: "POST";
};

export const serviceCatalog: Record<ServiceId, ServiceCatalogEntry> = {
  scan_xlayer_market: {
    id: "scan_xlayer_market",
    name: "Scan X Layer Market",
    description: "Reads configured X Layer watchlist tokens and returns live liquidity, volume, and momentum context.",
    priceUsd: env.PRICE_SCAN_XLAYER_MARKET,
    method: "POST"
  },
  score_token_opportunity: {
    id: "score_token_opportunity",
    name: "Score Token Opportunity",
    description: "Scores one X Layer token using live DEX data, risk flags, liquidity quality, and AI reasoning.",
    priceUsd: env.PRICE_SCORE_TOKEN_OPPORTUNITY,
    method: "POST"
  },
  generate_trade_signal: {
    id: "generate_trade_signal",
    name: "Generate Trade Signal",
    description: "Creates a user-controlled trade plan with confidence, invalidation, sizing, and risk notes.",
    priceUsd: env.PRICE_GENERATE_TRADE_SIGNAL,
    method: "POST"
  },
  risk_check_trade: {
    id: "risk_check_trade",
    name: "Risk Check Trade",
    description: "Checks a proposed trade for volatility, liquidity, concentration, and execution risk.",
    priceUsd: env.PRICE_RISK_CHECK_TRADE,
    method: "POST"
  },
  simulate_strategy_nav: {
    id: "simulate_strategy_nav",
    name: "Simulate Strategy NAV",
    description: "Calculates transparent strategy NAV from caller-supplied fills and live token marks.",
    priceUsd: env.PRICE_SIMULATE_STRATEGY_NAV,
    method: "POST"
  },
  generate_agent_update_post: {
    id: "generate_agent_update_post",
    name: "Generate Agent Update Post",
    description: "Turns agent decisions and live market context into a concise X post for #okxai distribution.",
    priceUsd: env.PRICE_GENERATE_AGENT_UPDATE_POST,
    method: "POST"
  }
};

export function isServiceId(value: string): value is ServiceId {
  return serviceIds.includes(value as ServiceId);
}
