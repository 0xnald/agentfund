import { z } from "zod";
import { callStrategyModel } from "@/lib/agent/llm";
import { confidenceFromScore } from "@/lib/agent/scoring";
import {
  discoverOkxDexOpportunities,
  fetchOkxDexQuote,
  fetchOkxDexTokens,
  OkxOpportunity,
  scoreOkxQuote
} from "@/lib/market/okxDex";
import { env } from "@/lib/env";
import { getChainSnapshot, getTokenMetadata, getWatchlist, parseAddress } from "@/lib/xlayer/client";
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

const QUOTE_TOKEN_DECIMALS = 6;

function parseRequestedAddress(tokenAddress: string | undefined, fieldName: string) {
  if (!tokenAddress || tokenAddress.toLowerCase() === "auto") {
    return undefined;
  }

  return parseAddress(tokenAddress, fieldName);
}

function decimalAmount(rawAmount: string | undefined, decimals: number) {
  const value = Number(rawAmount ?? 0);

  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value / 10 ** decimals;
}

function markPriceUsd(opportunity: Pick<OkxOpportunity, "quote" | "decimals">) {
  if (opportunity.quote.estimatedPriceUsd && opportunity.quote.estimatedPriceUsd > 0) {
    return opportunity.quote.estimatedPriceUsd;
  }

  const toStable = decimalAmount(opportunity.quote.toTokenAmount, QUOTE_TOKEN_DECIMALS);
  const fromToken = decimalAmount(opportunity.quote.fromTokenAmount, opportunity.decimals);
  return fromToken > 0 ? toStable / fromToken : 0;
}

async function opportunityFromAddress(tokenAddress: `0x${string}`) {
  const tokens = await fetchOkxDexTokens();
  const token = tokens.find((candidate) => candidate.tokenContractAddress?.toLowerCase() === tokenAddress.toLowerCase());

  if (!token) {
    throw new Error(`Token ${tokenAddress} was not returned by OKX DEX Aggregator all-tokens for X Layer.`);
  }

  const decimals = Number(token.decimals ?? 18);
  const quote = await fetchOkxDexQuote({
    fromTokenAddress: tokenAddress,
    amount: (10n ** BigInt(Math.max(0, decimals))).toString()
  });

  return {
    tokenAddress,
    symbol: token.tokenSymbol ?? "UNKNOWN",
    name: token.tokenName ?? token.tokenSymbol ?? "Unknown token",
    decimals,
    quote,
    score: scoreOkxQuote(quote)
  };
}

async function marketFacts(tokenAddress?: `0x${string}`) {
  const opportunity = tokenAddress
    ? await opportunityFromAddress(tokenAddress)
    : (await discoverOkxDexOpportunities(1))[0];

  if (!opportunity) {
    throw new Error(
      "OKX DEX Aggregator returned no executable X Layer opportunities. Check OKX API credentials/project ID and token routing availability."
    );
  }

  const priceUsd = markPriceUsd(opportunity);

  return {
    ...opportunity,
    priceUsd,
    source: "okx_dex_aggregator",
    quoteTokenAddress: env.OKX_DEX_QUOTE_TOKEN_ADDRESS,
    routeCount: opportunity.quote.dexRouterList?.length ?? 0,
    quoteRouteCount: opportunity.quote.quoteCompareList?.length ?? 0,
    priceImpactPercentage: Number(opportunity.quote.priceImpactPercentage ?? 0)
  };
}

async function scanXLayerMarket(input: unknown) {
  const request = scanMarketSchema.parse(input);
  const chain = await getChainSnapshot();
  let ranked: OkxOpportunity[] = [];
  let okxError: string | undefined;

  try {
    ranked = await discoverOkxDexOpportunities(request.maxTokens);
  } catch (error) {
    okxError = error instanceof Error ? error.message : "Unknown OKX DEX Aggregator failure.";
  }

  if (okxError) {
    const fallbackTokens = await Promise.all(
      getWatchlist()
        .filter((tokenAddress) => tokenAddress.toLowerCase() !== env.OKX_DEX_QUOTE_TOKEN_ADDRESS.toLowerCase())
        .slice(0, request.maxTokens)
        .map(async (tokenAddress) => {
          const metadata = await getTokenMetadata(tokenAddress);

          return {
            ...metadata,
            source: "xlayer_onchain_watchlist_fallback",
            quoteTokenAddress: env.OKX_DEX_QUOTE_TOKEN_ADDRESS,
            priceUsd: 0,
            routeCount: 0,
            quoteRouteCount: 0,
            priceImpactPercentage: 0,
            quote: {
              fromTokenAmount: "",
              toTokenAmount: "",
              priceImpactPercentage: "",
              tradeFee: "",
              dexRouterList: [],
              quoteCompareList: [],
              routerResult: {},
              raw: {}
            },
            score: {
              score: 25,
              grade: "avoid" as const,
              factors: ["verified token metadata directly from X Layer RPC"],
              riskFlags: ["OKX DEX Aggregator route not confirmed from this runtime"]
            }
          };
        })
    );

    return {
      strategy: request.strategy,
      chain,
      discovery: {
        mode: "okx_dex_aggregator_market_discovery",
        status: "degraded",
        chainIndex: env.OKX_DEX_CHAIN_INDEX,
        quoteTokenAddress: env.OKX_DEX_QUOTE_TOKEN_ADDRESS,
        tokenSource: env.OKX_DEX_TOKENS_PATH,
        quoteSource: env.OKX_DEX_QUOTE_PATH,
        fallback: "xlayer_onchain_watchlist_metadata",
        upstreamError: okxError
      },
      ranked: fallbackTokens,
      generatedAt: new Date().toISOString()
    };
  }

  return {
    strategy: request.strategy,
    chain,
    discovery: {
      mode: "okx_dex_aggregator_market_discovery",
      chainIndex: env.OKX_DEX_CHAIN_INDEX,
      quoteTokenAddress: env.OKX_DEX_QUOTE_TOKEN_ADDRESS,
      tokenSource: env.OKX_DEX_TOKENS_PATH,
      quoteSource: env.OKX_DEX_QUOTE_PATH,
      ranking: "OKX executable route, route diversity, USD mark context, and price impact"
    },
    ranked: ranked.map((opportunity) => ({
      ...opportunity,
      priceUsd: markPriceUsd(opportunity),
      source: "okx_dex_aggregator"
    })),
    generatedAt: new Date().toISOString()
  };
}

async function scoreTokenOpportunity(input: unknown) {
  const request = scoreTokenSchema.parse(input);
  const tokenAddress = parseRequestedAddress(request.tokenAddress, "tokenAddress");
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
  const priceImpact = Math.abs(facts.priceImpactPercentage);

  if (facts.routeCount === 0) {
    flags.push("OKX route engine did not expose a router path");
  }

  if (priceImpact > 5) {
    flags.push("OKX quote price impact exceeds 5%");
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
    okxRouteCount: facts.routeCount,
    okxQuoteRouteCount: facts.quoteRouteCount,
    priceImpactPercentage: facts.priceImpactPercentage,
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
  const facts = request.tokenAddress ? await marketFacts(tokenAddress) : undefined;

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
