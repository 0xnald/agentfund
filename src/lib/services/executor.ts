import { z } from "zod";
import { callStrategyModel } from "@/lib/agent/llm";
import { confidenceFromScore } from "@/lib/agent/scoring";
import { getMarketOpportunity, getMarketSnapshot, MarketOpportunity } from "@/lib/market/snapshot";
import { env } from "@/lib/env";
import { getChainSnapshot, parseAddress } from "@/lib/xlayer/client";
import { ServiceId } from "@/lib/services/catalog";
import {
  generatePostSchema,
  generateTradeSignalSchema,
  riskCheckTradeSchema,
  scanMarketSchema,
  scoreTokenSchema,
  simulateNavSchema
} from "@/lib/services/schemas";

export type ServiceExecutionResult = {
  ok: true;
  service: ServiceId;
  data: unknown;
};

function parseRequestedAddress(tokenAddress: string | undefined, fieldName: string) {
  if (!tokenAddress || tokenAddress.toLowerCase() === "auto") {
    return undefined;
  }

  return parseAddress(tokenAddress, fieldName);
}

function opportunityConfidence(opportunity: MarketOpportunity) {
  if ("research" in opportunity) {
    return opportunity.research.confidence;
  }

  return confidenceFromScore(opportunity.score.score);
}

function opportunityReason(opportunity: MarketOpportunity) {
  if ("swapCount" in opportunity.activity) {
    return `${opportunity.activity.swapCount} recent Uniswap v4 swap(s) observed`;
  }

  if ("transactions24h" in opportunity.activity) {
    return `${opportunity.activity.transactions24h} GeckoTerminal 24h pool transaction(s), $${Math.round(
      opportunity.activity.volume24hUsd
    ).toLocaleString()} 24h volume`;
  }

  return `${opportunity.activity.transferCount} recent transfer(s), ${opportunity.activity.uniqueWallets} unique wallet(s) observed`;
}

function opportunityDataGaps(opportunity: MarketOpportunity) {
  const gaps = [...opportunity.score.riskFlags];
  const gecko = opportunity.external?.geckoTerminal;

  if (!("pool" in opportunity) && opportunity.source !== "geckoterminal_xlayer_discovery") {
    gaps.push("No quote-routed Uniswap v4 pool was found in the configured scan window.");
    gaps.push("Price, depth, and slippage remain unavailable until a routed pool is discovered.");
  }

  if (opportunity.source === "geckoterminal_xlayer_discovery") {
    gaps.push("Token was discovered from GeckoTerminal X Layer pools and still needs native X Layer transfer or Uniswap v4 route confirmation.");
  }

  if (!gecko || gecko.status === "failed") {
    gaps.push("GeckoTerminal X Layer validation is unavailable.");
  } else if (gecko.status === "partial") {
    gaps.push(...gecko.warnings);
  }

  return [...new Set(gaps)];
}

function opportunityIntelligence(opportunity: MarketOpportunity) {
  return {
    confidence: opportunityConfidence(opportunity),
    whySelected: [
      `AgentFund score: ${opportunity.score.score}/100 (${opportunity.score.grade}).`,
      opportunityReason(opportunity),
      ...opportunity.score.factors
    ],
    dataGaps: opportunityDataGaps(opportunity)
  };
}

function normalizeMarketFacts(opportunity: MarketOpportunity) {
  if ("pool" in opportunity) {
    return {
      ...opportunity,
      intelligence: opportunityIntelligence(opportunity),
      source: "uniswap_v4_xlayer" as const
    };
  }

  const normalized = {
    ...opportunity,
    intelligence: opportunityIntelligence(opportunity),
    poolId: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    pool: {
      poolManager: env.UNISWAP_V4_POOL_MANAGER_ADDRESS as `0x${string}`,
      currency0: opportunity.tokenAddress,
      currency1: opportunity.tokenAddress,
      fee: 0,
      tickSpacing: 0,
      hooks: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      initializedAtBlock: "0"
    },
    route: {
      quoteTokenAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      quoteTokenSymbol: "UNROUTED",
      direction: "currency0_to_quote" as const,
      source: "uniswap_v4_pool_sqrt_price" as const
    }
  };

  return normalized;
}

async function marketFacts(tokenAddress?: `0x${string}`) {
  return normalizeMarketFacts(await getMarketOpportunity(tokenAddress, { serviceSafe: true }));
}

function recentSwapCount(facts: ReturnType<typeof normalizeMarketFacts>) {
  return "swapCount" in facts.activity ? facts.activity.swapCount : 0;
}

async function scanXLayerMarket(input: unknown) {
  const request = scanMarketSchema.parse(input);
  const snapshot = await getMarketSnapshot({ maxTokens: request.maxTokens, serviceSafe: true });

  return {
    strategy: request.strategy,
    ...snapshot
  };
}

async function scoreTokenOpportunity(input: unknown) {
  const request = scoreTokenSchema.parse(input);
  const tokenAddress = parseRequestedAddress(request.tokenAddress, "tokenAddress");
  const [chain, facts] = await Promise.all([
    getChainSnapshot(),
    marketFacts(tokenAddress)
  ]);

  return {
    strategy: request.strategy,
    chain,
    ...facts,
    generatedAt: new Date().toISOString()
  };
}

async function generateTradeSignal(input: unknown) {
  const request = generateTradeSignalSchema.parse(input);
  const tokenAddress = parseRequestedAddress(request.tokenAddress, "tokenAddress");
  const facts = await marketFacts(tokenAddress);
  const confidence = confidenceFromScore(facts.score.score);

  const narrative = await callStrategyModel([
    {
      role: "system",
      content:
        "You are AgentFund, an ASP that generates user-controlled X Layer trade intelligence. Do not claim guaranteed profit. Return concise JSON with thesis, action, invalidation, sizing_note, and risk_summary."
    },
    {
      role: "user",
      content: JSON.stringify({
        agentName: request.agentName,
        strategy: request.strategy,
        riskProfile: request.riskProfile,
        accountSizeUsd: request.accountSizeUsd,
        market: facts
      })
    }
  ]);

  return {
    agentName: request.agentName,
    tokenAddress: facts.tokenAddress,
    confidence,
    score: facts.score,
    market: facts,
    modelOutput: narrative,
    executionMode: "user_approved",
    generatedAt: new Date().toISOString()
  };
}

async function riskCheckTrade(input: unknown) {
  const request = riskCheckTradeSchema.parse(input);
  const tokenAddress = parseRequestedAddress(request.tokenAddress, "tokenAddress");
  const facts = await marketFacts(tokenAddress);
  const flags = [...facts.score.riskFlags];

  const swapCount = recentSwapCount(facts);

  if (swapCount === 0) {
    flags.push("no recent Uniswap v4 swaps in scan window");
  }

  if (facts.pool.hooks !== "0x0000000000000000000000000000000000000000") {
    flags.push("custom Uniswap v4 hook requires review before execution");
  }

  if (request.maxSlippageBps > 300) {
    flags.push("requested slippage tolerance is high");
  }

  return {
    side: request.side,
    tokenAddress: facts.tokenAddress,
    notionalUsd: request.notionalUsd,
    maxSlippageBps: request.maxSlippageBps,
    visibleLiquidityUsd: null,
    uniswapPoolId: facts.poolId,
    recentSwapCount: swapCount,
    hookAddress: facts.pool.hooks,
    riskLevel: flags.length >= 3 ? "high" : flags.length >= 1 ? "medium" : "low",
    flags,
    market: facts,
    generatedAt: new Date().toISOString()
  };
}

async function simulateStrategyNav(input: unknown) {
  const request = simulateNavSchema.parse(input);
  const positions = await Promise.all(
    request.positions.map(async (position) => {
      const tokenAddress = parseRequestedAddress(position.tokenAddress, "position tokenAddress");
      const facts = await marketFacts(tokenAddress);
      const priceUsd = facts.priceUsd;
      const markValueUsd = priceUsd * position.units;

      return {
        tokenAddress: facts.tokenAddress,
        units: position.units,
        priceUsd,
        markValueUsd,
        costBasisUsd: position.costBasisUsd,
        unrealizedPnlUsd:
          typeof position.costBasisUsd === "number" ? markValueUsd - position.costBasisUsd : undefined,
        symbol: facts.symbol
      };
    })
  );
  const positionsValueUsd = positions.reduce((sum, position) => sum + position.markValueUsd, 0);
  const navUsd = request.cashUsd + positionsValueUsd;

  return {
    startingNavUsd: request.startingNavUsd,
    cashUsd: request.cashUsd,
    positionsValueUsd,
    navUsd,
    returnPct: Number((((navUsd - request.startingNavUsd) / request.startingNavUsd) * 100).toFixed(2)),
    positions,
    generatedAt: new Date().toISOString()
  };
}

async function generateAgentUpdatePost(input: unknown) {
  const request = generatePostSchema.parse(input);
  const tokenAddress = parseRequestedAddress(request.tokenAddress, "tokenAddress");
  const facts = request.tokenAddress
    ? await marketFacts(tokenAddress)
    : undefined;

  const post = await callStrategyModel([
    {
      role: "system",
      content:
        "Write one clear X post under 260 characters from an autonomous X Layer strategy agent. No financial guarantees. Mention that execution is user-approved when relevant."
    },
    {
      role: "user",
      content: JSON.stringify({
        agentName: request.agentName,
        decision: request.decision,
        reason: request.reason,
        hashtag: request.includeHashtag ? "#okxai" : "",
        market: facts
      })
    }
  ]);

  return {
    agentName: request.agentName,
    post,
    market: facts,
    generatedAt: new Date().toISOString()
  };
}

export async function executeService(service: ServiceId, input: unknown): Promise<ServiceExecutionResult> {
  const executors = {
    scan_xlayer_market: scanXLayerMarket,
    score_token_opportunity: scoreTokenOpportunity,
    generate_trade_signal: generateTradeSignal,
    risk_check_trade: riskCheckTrade,
    simulate_strategy_nav: simulateStrategyNav,
    generate_agent_update_post: generateAgentUpdatePost
  } satisfies Record<ServiceId, (input: unknown) => Promise<unknown>>;

  const data = await executors[service](input);

  return {
    ok: true,
    service,
    data
  };
}

export function formatServiceError(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      error: "invalid_request",
      issues: error.issues
    };
  }

  if (error instanceof Error) {
    return {
      error: "service_execution_failed",
      message: error.message
    };
  }

  return {
    error: "service_execution_failed",
    message: "Unknown service execution error."
  };
}
