import { z } from "zod";
import { callStrategyModel } from "@/lib/agent/llm";
import { confidenceFromScore } from "@/lib/agent/scoring";
import { researchCandidates } from "@/lib/market/research";
import { discoverUniswapV4Opportunities } from "@/lib/market/uniswapV4";
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

async function marketFacts(tokenAddress?: `0x${string}`) {
  const opportunities = await discoverUniswapV4Opportunities(tokenAddress ? 50 : 1);
  const opportunity = tokenAddress
    ? opportunities.find((item) => item.tokenAddress.toLowerCase() === tokenAddress.toLowerCase())
    : opportunities[0];

  if (!opportunity) {
    throw new Error("No Uniswap v4 pool opportunity found in the configured scan window.");
  }

  return {
    ...opportunity,
    source: "uniswap_v4_xlayer"
  };
}

function recentSwapCount(facts: Awaited<ReturnType<typeof marketFacts>> | Awaited<ReturnType<typeof researchMarketFacts>>) {
  return "swapCount" in facts.activity ? facts.activity.swapCount : 0;
}

async function researchMarketFacts(tokenAddress?: `0x${string}`) {
  const [candidate] = await researchCandidates(1, tokenAddress);

  if (!candidate) {
    throw new Error("No Uniswap v4 pool opportunity found and no research candidates are configured.");
  }

  return {
    ...candidate,
    poolId: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    pool: {
      poolManager: env.UNISWAP_V4_POOL_MANAGER_ADDRESS as `0x${string}`,
      currency0: candidate.tokenAddress,
      currency1: candidate.tokenAddress,
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
}

async function scanXLayerMarket(input: unknown) {
  const request = scanMarketSchema.parse(input);
  const chain = await getChainSnapshot();
  const ranked = await discoverUniswapV4Opportunities(request.maxTokens);
  const fallbackRanked =
    ranked.length > 0
      ? ranked
      : await researchCandidates(request.maxTokens);

  return {
    strategy: request.strategy,
    chain,
    discovery: {
      mode: "uniswap_v4_xlayer_onchain_scan",
      poolManager: env.UNISWAP_V4_POOL_MANAGER_ADDRESS,
      stateView: env.UNISWAP_V4_STATE_VIEW_ADDRESS,
      quoter: env.UNISWAP_V4_QUOTER_ADDRESS,
      universalRouter: env.UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
      poolDiscoveryBlocks: env.UNISWAP_V4_POOL_DISCOVERY_BLOCKS,
      swapScanBlocks: env.UNISWAP_V4_SWAP_SCAN_BLOCKS,
      logChunkBlocks: env.UNISWAP_V4_LOG_CHUNK_BLOCKS,
      status: ranked.length > 0 ? "live" : "research_fallback_transfer_activity",
      quoteTokenAddresses: env.UNISWAP_V4_QUOTE_TOKEN_ADDRESSES.split(",").map((item) => item.trim()).filter(Boolean),
      ranking: "Uniswap v4 initialized pools, recent swap flow, pool liquidity, quote route, fee tier, and hook risk"
    },
    ranked: fallbackRanked,
    generatedAt: new Date().toISOString()
  };
}

async function scoreTokenOpportunity(input: unknown) {
  const request = scoreTokenSchema.parse(input);
  const tokenAddress = parseRequestedAddress(request.tokenAddress, "tokenAddress");
  const [chain, facts] = await Promise.all([
    getChainSnapshot(),
    marketFacts(tokenAddress).catch(() => researchMarketFacts(tokenAddress))
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
  const facts = await marketFacts(tokenAddress).catch(() => researchMarketFacts(tokenAddress));
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
  const facts = await marketFacts(tokenAddress).catch(() => researchMarketFacts(tokenAddress));
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
      const facts = await marketFacts(tokenAddress).catch(() => researchMarketFacts(tokenAddress));
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
    ? await marketFacts(tokenAddress).catch(() => researchMarketFacts(tokenAddress))
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
