import { env } from "@/lib/env";
import { researchCandidates, ResearchCandidate } from "@/lib/market/research";
import { discoverUniswapV4Opportunities, UniswapV4PoolOpportunity } from "@/lib/market/uniswapV4";
import { getChainSnapshot } from "@/lib/xlayer/client";

export type MarketOpportunity =
  | (UniswapV4PoolOpportunity & { source: "uniswap_v4_xlayer" })
  | ResearchCandidate;

export type MarketSnapshot = {
  chain: Awaited<ReturnType<typeof getChainSnapshot>>;
  discovery: {
    mode: "uniswap_v4_xlayer_onchain_scan";
    poolManager: string;
    stateView: string;
    quoter: string;
    universalRouter: string;
    poolDiscoveryBlocks: number;
    swapScanBlocks: number;
    logChunkBlocks: number;
    status: "live" | "research_fallback_transfer_activity" | "review_safe_watchlist_metadata";
    quoteTokenAddresses: string[];
    ranking: string;
    cache: {
      state: "fresh" | "stale" | "refreshing";
      ttlMs: number;
      staleMs: number;
      refreshedAt: string;
      expiresAt: string;
    };
  };
  ranked: MarketOpportunity[];
  selection?: {
    tokenAddress: `0x${string}`;
    symbol: string;
    score: number;
    grade: MarketOpportunity["score"]["grade"];
    confidence: "low" | "medium" | "high";
    whySelected: string[];
    dataGaps: string[];
  };
  alternatives: Array<{
    tokenAddress: `0x${string}`;
    symbol: string;
    score: number;
    grade: MarketOpportunity["score"]["grade"];
    reason: string;
  }>;
  generatedAt: string;
};

type CacheEntry = {
  snapshot: MarketSnapshot;
  refreshedAtMs: number;
};

let cacheEntry: CacheEntry | undefined;
let refreshPromise: Promise<MarketSnapshot> | undefined;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

function quoteTokenAddresses() {
  return env.UNISWAP_V4_QUOTE_TOKEN_ADDRESSES.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function attachSource(opportunity: UniswapV4PoolOpportunity | ResearchCandidate): MarketOpportunity {
  if ("pool" in opportunity) {
    return {
      ...opportunity,
      source: "uniswap_v4_xlayer"
    };
  }

  return opportunity;
}

async function safeChainSnapshot() {
  try {
    return await withTimeout(getChainSnapshot(), 2500, "X Layer chain snapshot");
  } catch {
    return {
      chainId: env.NEXT_PUBLIC_AGENTFUND_CHAIN_ID,
      chainName: env.NEXT_PUBLIC_AGENTFUND_CHAIN_NAME,
      rpcUrl: env.XLAYER_RPC_URL,
      blockNumber: "unavailable",
      gasPriceWei: "unavailable",
      gasPriceOkb: "unavailable",
      receiver: env.NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS,
      receiverBalanceOkb: "unavailable"
    };
  }
}

async function quickWatchlistCandidates(limit: number): Promise<ResearchCandidate[]> {
  const quotes = new Set(quoteTokenAddresses().map((item) => item.toLowerCase()));
  const tokens = env.AGENTFUND_WATCHLIST.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !quotes.has(item.toLowerCase()))
    .slice(0, limit);

  const candidates = await Promise.all(
    tokens.map(async (tokenAddress, index) => {
      const metadata = await import("@/lib/xlayer/client").then(({ getTokenMetadata }) =>
        withTimeout(getTokenMetadata(tokenAddress as `0x${string}`), 1800, "token metadata").catch(() => ({
          tokenAddress: tokenAddress as `0x${string}`,
          symbol: `ASSET${index + 1}`,
          name: "X Layer asset",
          decimals: 18
        }))
      );
      const score = Math.max(35, 72 - index * 8);

      return {
        ...metadata,
        priceUsd: 0,
        source: "xlayer_research_transfer_activity" as const,
        activity: {
          transferCount: 0,
          uniqueWallets: 0,
          nonZeroTransfers: 0,
          scanBlocks: 0
        },
        score: {
          score,
          grade: score >= 65 ? "qualified" : score >= 45 ? "watch" : "avoid",
          factors: ["configured X Layer candidate", "metadata resolved from token contract when RPC is responsive"],
          riskFlags: ["deep pool and transfer scan deferred to refresh endpoint"]
        },
        research: {
          method: "erc20_transfer_activity" as const,
          confidence: score >= 65 ? "medium" : "low",
          notes: [
            "Returned from the review-safe fast path to avoid paid call timeout.",
            "Use /api/market/refresh for a deeper Uniswap v4 and transfer-log scan."
          ]
        }
      } satisfies ResearchCandidate;
    })
  );

  return candidates;
}

function confidenceFor(opportunity: MarketOpportunity): "low" | "medium" | "high" {
  if ("research" in opportunity) {
    return opportunity.research.confidence;
  }

  return opportunity.score.score >= 75 ? "high" : opportunity.score.score >= 50 ? "medium" : "low";
}

function activityReason(opportunity: MarketOpportunity) {
  if ("swapCount" in opportunity.activity) {
    return `${opportunity.activity.swapCount} recent Uniswap v4 swap(s) observed`;
  }

  return `${opportunity.activity.transferCount} recent transfer(s), ${opportunity.activity.uniqueWallets} unique wallet(s) observed`;
}

function dataGapsFor(opportunity: MarketOpportunity, status: MarketSnapshot["discovery"]["status"]) {
  const gaps = [...opportunity.score.riskFlags];

  if (status === "research_fallback_transfer_activity") {
    gaps.push("No quote-routed Uniswap v4 pool was found in the configured scan window.");
    gaps.push("Price, depth, and slippage remain unavailable until a routed pool is discovered.");
  }

  return [...new Set(gaps)];
}

function buildSelection(ranked: MarketOpportunity[], status: MarketSnapshot["discovery"]["status"]) {
  const [top] = ranked;

  if (!top) {
    return undefined;
  }

  const whySelected = [
    `Highest current AgentFund score among configured X Layer candidates: ${top.score.score}/100.`,
    activityReason(top),
    ...top.score.factors
  ];

  return {
    tokenAddress: top.tokenAddress,
    symbol: top.symbol,
    score: top.score.score,
    grade: top.score.grade,
    confidence: confidenceFor(top),
    whySelected: [...new Set(whySelected)],
    dataGaps: dataGapsFor(top, status)
  };
}

function buildAlternatives(ranked: MarketOpportunity[]) {
  return ranked.slice(1, 5).map((item) => ({
    tokenAddress: item.tokenAddress,
    symbol: item.symbol,
    score: item.score.score,
    grade: item.score.grade,
    reason: activityReason(item)
  }));
}

function stampSnapshot(snapshot: MarketSnapshot, state: MarketSnapshot["discovery"]["cache"]["state"]) {
  const refreshedAtMs = Date.parse(snapshot.discovery.cache.refreshedAt);

  return {
    ...snapshot,
    discovery: {
      ...snapshot.discovery,
      cache: {
        ...snapshot.discovery.cache,
        state,
        ttlMs: env.AGENTFUND_MARKET_CACHE_TTL_MS,
        staleMs: env.AGENTFUND_MARKET_CACHE_STALE_MS,
        expiresAt: new Date(refreshedAtMs + env.AGENTFUND_MARKET_CACHE_TTL_MS).toISOString()
      }
    }
  };
}

async function buildFreshSnapshot(maxTokens: number): Promise<MarketSnapshot> {
  const chain = await getChainSnapshot();
  const liveRanked = await discoverUniswapV4Opportunities(maxTokens);
  const status: MarketSnapshot["discovery"]["status"] =
    liveRanked.length > 0 ? "live" : "research_fallback_transfer_activity";
  const ranked = (liveRanked.length > 0 ? liveRanked : await researchCandidates(maxTokens)).map(attachSource);
  const generatedAt = new Date().toISOString();

  return {
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
      status,
      quoteTokenAddresses: quoteTokenAddresses(),
      ranking:
        status === "live"
          ? "Uniswap v4 initialized pools, recent swap flow, pool liquidity, quote route, fee tier, and hook risk"
          : "Fallback research ranks configured X Layer assets by live ERC-20 transfer activity and wallet breadth",
      cache: {
        state: "fresh",
        ttlMs: env.AGENTFUND_MARKET_CACHE_TTL_MS,
        staleMs: env.AGENTFUND_MARKET_CACHE_STALE_MS,
        refreshedAt: generatedAt,
        expiresAt: new Date(Date.now() + env.AGENTFUND_MARKET_CACHE_TTL_MS).toISOString()
      }
    },
    ranked,
    selection: buildSelection(ranked, status),
    alternatives: buildAlternatives(ranked),
    generatedAt
  };
}

async function buildFastSnapshot(maxTokens: number): Promise<MarketSnapshot> {
  const [chain, ranked] = await Promise.all([safeChainSnapshot(), quickWatchlistCandidates(maxTokens)]);
  const generatedAt = new Date().toISOString();
  const status: MarketSnapshot["discovery"]["status"] = "review_safe_watchlist_metadata";

  return {
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
      status,
      quoteTokenAddresses: quoteTokenAddresses(),
      ranking: "Fast paid-call response ranks configured X Layer assets while deep RPC log scans run through /api/market/refresh",
      cache: {
        state: "fresh",
        ttlMs: env.AGENTFUND_MARKET_CACHE_TTL_MS,
        staleMs: env.AGENTFUND_MARKET_CACHE_STALE_MS,
        refreshedAt: generatedAt,
        expiresAt: new Date(Date.now() + env.AGENTFUND_MARKET_CACHE_TTL_MS).toISOString()
      }
    },
    ranked,
    selection: buildSelection(ranked, status),
    alternatives: buildAlternatives(ranked),
    generatedAt
  };
}

async function refreshMarketSnapshot(maxTokens: number) {
  if (!refreshPromise) {
    refreshPromise = buildFreshSnapshot(maxTokens)
      .then((snapshot) => {
        cacheEntry = {
          snapshot,
          refreshedAtMs: Date.parse(snapshot.discovery.cache.refreshedAt)
        };
        return snapshot;
      })
      .finally(() => {
        refreshPromise = undefined;
      });
  }

  return refreshPromise;
}

export async function getMarketSnapshot(params?: { maxTokens?: number; forceRefresh?: boolean; serviceSafe?: boolean }) {
  const maxTokens = params?.maxTokens ?? env.AGENTFUND_MARKET_CACHE_MAX_TOKENS;
  const now = Date.now();

  if (!params?.forceRefresh && cacheEntry) {
    const ageMs = now - cacheEntry.refreshedAtMs;

    if (ageMs < env.AGENTFUND_MARKET_CACHE_TTL_MS) {
      return stampSnapshot(cacheEntry.snapshot, "fresh");
    }

    if (ageMs < env.AGENTFUND_MARKET_CACHE_STALE_MS) {
      void refreshMarketSnapshot(maxTokens).catch(() => undefined);
      return stampSnapshot(cacheEntry.snapshot, "stale");
    }
  }

  if (refreshPromise && cacheEntry) {
    return stampSnapshot(cacheEntry.snapshot, "refreshing");
  }

  if (params?.serviceSafe) {
    return withTimeout(refreshMarketSnapshot(maxTokens), env.AGENTFUND_SERVICE_TIMEOUT_MS, "market snapshot").catch(() =>
      buildFastSnapshot(maxTokens)
    );
  }

  return refreshMarketSnapshot(maxTokens);
}

export async function getMarketOpportunity(tokenAddress?: `0x${string}`, params?: { serviceSafe?: boolean }) {
  if (!tokenAddress) {
    const snapshot = await getMarketSnapshot({ serviceSafe: params?.serviceSafe });
    const [top] = snapshot.ranked;

    if (!top) {
      throw new Error("No X Layer market opportunity found in the configured scan window.");
    }

    return top;
  }

  const snapshot = await getMarketSnapshot({ serviceSafe: params?.serviceSafe });
  const cached = snapshot.ranked.find((item) => item.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());

  if (cached) {
    return cached;
  }

  const [candidate] = await researchCandidates(1, tokenAddress);

  if (!candidate) {
    throw new Error("No X Layer market research candidate found for tokenAddress.");
  }

  return {
    ...candidate,
    source: "xlayer_research_transfer_activity" as const
  };
}
