import { z } from "zod";
import { callStrategyModel } from "@/lib/agent/llm";
import { confidenceFromScore, scorePair } from "@/lib/agent/scoring";
import { fetchTokenPairs, pickPrimaryPair } from "@/lib/market/dexscreener";
import { getChainSnapshot, getWatchlist, parseAddress } from "@/lib/xlayer/client";
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

async function marketFacts(tokenAddress: `0x${string}`) {
  const pairs = await fetchTokenPairs(tokenAddress);
  const primaryPair = pickPrimaryPair(pairs);

  if (!primaryPair) {
    throw new Error(`No live DEX pairs found for token ${tokenAddress} on X Layer.`);
  }

  const score = scorePair(primaryPair);

  return {
    tokenAddress,
    pairCount: pairs.length,
    primaryPair,
    score
  };
}

async function scanXLayerMarket(input: unknown) {
  const request = scanMarketSchema.parse(input);
  const watchlist = getWatchlist().slice(0, request.maxTokens);

  if (watchlist.length === 0) {
    throw new Error("AGENTFUND_WATCHLIST must contain at least one X Layer token address for live market scans.");
  }

  const [chain, tokens] = await Promise.all([
    getChainSnapshot(),
    Promise.all(watchlist.map((token) => marketFacts(token)))
  ]);

  const ranked = tokens.sort((a, b) => b.score.score - a.score.score);

  return {
    strategy: request.strategy,
    chain,
    ranked,
    generatedAt: new Date().toISOString()
  };
}

async function scoreTokenOpportunity(input: unknown) {
  const request = scoreTokenSchema.parse(input);
  const tokenAddress = parseAddress(request.tokenAddress, "tokenAddress");
  const [chain, facts] = await Promise.all([getChainSnapshot(), marketFacts(tokenAddress)]);

  return {
    strategy: request.strategy,
    chain,
    ...facts,
    generatedAt: new Date().toISOString()
  };
}

async function generateTradeSignal(input: unknown) {
  const request = generateTradeSignalSchema.parse(input);
  const tokenAddress = parseAddress(request.tokenAddress, "tokenAddress");
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
    tokenAddress,
    confidence,
    score: facts.score,
    market: facts.primaryPair,
    modelOutput: narrative,
    executionMode: "user_approved",
    generatedAt: new Date().toISOString()
  };
}

async function riskCheckTrade(input: unknown) {
  const request = riskCheckTradeSchema.parse(input);
  const tokenAddress = parseAddress(request.tokenAddress, "tokenAddress");
  const facts = await marketFacts(tokenAddress);
  const liquidityUsd = facts.primaryPair.liquidity?.usd ?? 0;
  const tradeToLiquidity = liquidityUsd > 0 ? request.notionalUsd / liquidityUsd : Number.POSITIVE_INFINITY;
  const flags = [...facts.score.riskFlags];

  if (tradeToLiquidity > 0.02) {
    flags.push("trade size exceeds 2% of visible pool liquidity");
  }

  if (request.maxSlippageBps > 300) {
    flags.push("requested slippage tolerance is high");
  }

  return {
    side: request.side,
    tokenAddress,
    notionalUsd: request.notionalUsd,
    maxSlippageBps: request.maxSlippageBps,
    visibleLiquidityUsd: liquidityUsd,
    tradeToLiquidity: Number(tradeToLiquidity.toFixed(5)),
    riskLevel: flags.length >= 3 ? "high" : flags.length >= 1 ? "medium" : "low",
    flags,
    market: facts.primaryPair,
    generatedAt: new Date().toISOString()
  };
}

async function simulateStrategyNav(input: unknown) {
  const request = simulateNavSchema.parse(input);
  const positions = await Promise.all(
    request.positions.map(async (position) => {
      const tokenAddress = parseAddress(position.tokenAddress, "position tokenAddress");
      const facts = await marketFacts(tokenAddress);
      const priceUsd = Number(facts.primaryPair.priceUsd ?? 0);
      const markValueUsd = priceUsd * position.units;

      return {
        tokenAddress,
        units: position.units,
        priceUsd,
        markValueUsd,
        costBasisUsd: position.costBasisUsd,
        unrealizedPnlUsd:
          typeof position.costBasisUsd === "number" ? markValueUsd - position.costBasisUsd : undefined,
        symbol: facts.primaryPair.baseToken.symbol
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
  const facts = request.tokenAddress
    ? await marketFacts(parseAddress(request.tokenAddress, "tokenAddress"))
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
