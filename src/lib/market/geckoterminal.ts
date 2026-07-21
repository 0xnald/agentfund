import { env } from "@/lib/env";
import type { MarketOpportunity } from "@/lib/market/snapshot";

type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | Array<{ id: string; type: string }> }>;
};

type GeckoTerminalResponse = {
  data?: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
};

export type GeckoTerminalPoolSignal = {
  source: "geckoterminal_xlayer";
  status: "ok" | "partial" | "failed";
  network: string;
  poolAddress?: `0x${string}`;
  poolName?: string;
  tokenRole?: "base" | "quote";
  priceUsd?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  priceChange1hPct?: number;
  priceChange24hPct?: number;
  transactions24h?: number;
  buys24h?: number;
  sells24h?: number;
  confidence: "low" | "medium" | "high";
  freshness: {
    updatedAt: string;
    cacheTtlMs: number;
  };
  warnings: string[];
};

export type GeckoTerminalEnrichment = {
  external?: {
    geckoTerminal?: GeckoTerminalPoolSignal;
  };
};

export type GeckoTerminalDiscoveredCandidate = {
  tokenAddress: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number;
  source: "geckoterminal_xlayer_discovery";
  activity: {
    liquidityUsd: number;
    volume24hUsd: number;
    transactions24h: number;
    buys24h: number;
    sells24h: number;
  };
  score: {
    score: number;
    grade: "avoid" | "watch" | "qualified" | "high_conviction";
    factors: string[];
    riskFlags: string[];
  };
  research: {
    method: "geckoterminal_xlayer_pool_discovery";
    confidence: "low" | "medium" | "high";
    notes: string[];
  };
  external: {
    geckoTerminal: GeckoTerminalPoolSignal;
  };
};

const GECKOTERMINAL_CACHE_TTL_MS = 60_000;

type PoolCache = {
  fetchedAtMs: number;
  pools: JsonApiResource[];
  included: JsonApiResource[];
};

let poolCache: PoolCache | undefined;

function enabled() {
  return env.AGENTFUND_DATA_SOURCES.split(",")
    .map((item) => item.trim().toLowerCase())
    .includes("geckoterminal");
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asAddress(value: string | undefined) {
  if (value?.startsWith("0x") && value.length === 42) {
    return value as `0x${string}`;
  }

  return undefined;
}

function getRelationshipId(resource: JsonApiResource, name: string) {
  const data = resource.relationships?.[name]?.data;

  if (!data || Array.isArray(data)) {
    return undefined;
  }

  return data.id;
}

function includedById(included: JsonApiResource[]) {
  return new Map(included.map((resource) => [resource.id, resource]));
}

function tokenAddressFromIncluded(resource: JsonApiResource | undefined) {
  return asAddress(String(resource?.attributes?.address ?? ""));
}

function tokenSymbolFromIncluded(resource: JsonApiResource | undefined) {
  const symbol = resource?.attributes?.symbol;

  return typeof symbol === "string" && symbol ? symbol : "UNKNOWN";
}

function tokenNameFromIncluded(resource: JsonApiResource | undefined) {
  const name = resource?.attributes?.name;

  return typeof name === "string" && name ? name : "Unknown token";
}

function poolTokenAddresses(pool: JsonApiResource, included: JsonApiResource[]) {
  const index = includedById(included);
  const base = index.get(getRelationshipId(pool, "base_token") ?? "");
  const quote = index.get(getRelationshipId(pool, "quote_token") ?? "");

  return {
    base: tokenAddressFromIncluded(base),
    quote: tokenAddressFromIncluded(quote)
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AGENTFUND_DATA_SOURCE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json;version=20230203",
        ...(init?.headers ?? {})
      },
      next: {
        revalidate: 60
      }
    });

    if (!response.ok) {
      throw new Error(`GeckoTerminal returned HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function getTopPools() {
  const now = Date.now();

  if (poolCache && now - poolCache.fetchedAtMs < GECKOTERMINAL_CACHE_TTL_MS) {
    return poolCache;
  }

  const url = new URL(`https://api.geckoterminal.com/api/v2/networks/${env.GECKOTERMINAL_NETWORK}/pools`);
  url.searchParams.set("include", "base_token,quote_token,dex");
  url.searchParams.set("page", "1");

  const response = await fetchJson<GeckoTerminalResponse>(url.toString());
  const pools = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
  const included = response.included ?? [];
  poolCache = { fetchedAtMs: now, pools, included };

  return poolCache;
}

function confidenceFromPool(params: {
  liquidityUsd?: number;
  volume24hUsd?: number;
  transactions24h?: number;
  priceUsd?: number;
}): GeckoTerminalPoolSignal["confidence"] {
  let points = 0;

  if ((params.liquidityUsd ?? 0) >= 50_000) points += 2;
  else if ((params.liquidityUsd ?? 0) > 0) points += 1;

  if ((params.volume24hUsd ?? 0) >= 25_000) points += 2;
  else if ((params.volume24hUsd ?? 0) > 0) points += 1;

  if ((params.transactions24h ?? 0) >= 100) points += 2;
  else if ((params.transactions24h ?? 0) > 0) points += 1;

  if ((params.priceUsd ?? 0) > 0) points += 1;

  return points >= 5 ? "high" : points >= 3 ? "medium" : "low";
}

function signalFromPool(pool: JsonApiResource, role: "base" | "quote"): GeckoTerminalPoolSignal {
  const attributes = pool.attributes ?? {};
  const volume = attributes.volume_usd as Record<string, unknown> | undefined;
  const changes = attributes.price_change_percentage as Record<string, unknown> | undefined;
  const transactions = attributes.transactions as Record<string, unknown> | undefined;
  const h24Transactions = transactions?.h24 as Record<string, unknown> | undefined;
  const buys24h = asNumber(h24Transactions?.buys);
  const sells24h = asNumber(h24Transactions?.sells);
  const transactions24h =
    buys24h !== undefined || sells24h !== undefined ? (buys24h ?? 0) + (sells24h ?? 0) : undefined;
  const priceUsd = asNumber(role === "base" ? attributes.base_token_price_usd : attributes.quote_token_price_usd);
  const liquidityUsd = asNumber(attributes.reserve_in_usd);
  const volume24hUsd = asNumber(volume?.h24);
  const priceChange1hPct = asNumber(changes?.h1);
  const priceChange24hPct = asNumber(changes?.h24);
  const warnings: string[] = [];

  if (!liquidityUsd || liquidityUsd <= 0) {
    warnings.push("GeckoTerminal did not report positive pool liquidity.");
  }

  if (!volume24hUsd || volume24hUsd <= 0) {
    warnings.push("GeckoTerminal did not report positive 24h pool volume.");
  }

  if (!priceUsd || priceUsd <= 0) {
    warnings.push("GeckoTerminal did not report a positive token USD price.");
  }

  return {
    source: "geckoterminal_xlayer",
    status: warnings.length >= 3 ? "partial" : "ok",
    network: env.GECKOTERMINAL_NETWORK,
    poolAddress: asAddress(String(attributes.address ?? pool.id.split("_").at(-1) ?? "")),
    poolName: typeof attributes.name === "string" ? attributes.name : undefined,
    tokenRole: role,
    priceUsd,
    liquidityUsd,
    volume24hUsd,
    priceChange1hPct,
    priceChange24hPct,
    transactions24h,
    buys24h,
    sells24h,
    confidence: confidenceFromPool({ liquidityUsd, volume24hUsd, transactions24h, priceUsd }),
    freshness: {
      updatedAt: new Date().toISOString(),
      cacheTtlMs: GECKOTERMINAL_CACHE_TTL_MS
    },
    warnings
  };
}

function quoteTokenSet() {
  const configuredQuotes = env.UNISWAP_V4_QUOTE_TOKEN_ADDRESSES.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const commonQuoteSymbols = ["usdt", "usdt0", "usd₮0", "usdc", "usdg", "dai", "wokb", "okb"];

  return {
    addresses: new Set(configuredQuotes),
    symbols: new Set(commonQuoteSymbols)
  };
}

function isQuoteLikeToken(token: JsonApiResource | undefined) {
  const { addresses, symbols } = quoteTokenSet();
  const address = tokenAddressFromIncluded(token)?.toLowerCase();
  const symbol = tokenSymbolFromIncluded(token).toLowerCase();

  return (address ? addresses.has(address) : false) || symbols.has(symbol);
}

function discoveryScore(signal: GeckoTerminalPoolSignal) {
  const factors: string[] = [];
  const riskFlags: string[] = [];
  let score = 30;

  if ((signal.liquidityUsd ?? 0) >= 250_000) {
    score += 20;
    factors.push("GeckoTerminal discovered deep X Layer pool liquidity");
  } else if ((signal.liquidityUsd ?? 0) >= 25_000) {
    score += 12;
    factors.push("GeckoTerminal discovered usable X Layer pool liquidity");
  } else {
    score -= 12;
    riskFlags.push("GeckoTerminal discovered thin X Layer pool liquidity");
  }

  if ((signal.volume24hUsd ?? 0) >= 100_000) {
    score += 18;
    factors.push("GeckoTerminal discovered strong 24h X Layer volume");
  } else if ((signal.volume24hUsd ?? 0) >= 10_000) {
    score += 10;
    factors.push("GeckoTerminal discovered active 24h X Layer volume");
  } else {
    score -= 8;
    riskFlags.push("GeckoTerminal discovered weak 24h X Layer volume");
  }

  if ((signal.transactions24h ?? 0) >= 500) {
    score += 10;
    factors.push("GeckoTerminal discovered broad 24h pool transaction flow");
  } else if ((signal.transactions24h ?? 0) >= 50) {
    score += 5;
    factors.push("GeckoTerminal discovered measurable 24h pool transaction flow");
  } else {
    riskFlags.push("GeckoTerminal discovered limited 24h pool transaction flow");
  }

  const change1h = signal.priceChange1hPct ?? 0;
  const change24h = signal.priceChange24hPct ?? 0;

  if (change1h > 0 && change24h > 0) {
    score += 7;
    factors.push("GeckoTerminal discovered positive 1h and 24h price momentum");
  }

  if (Math.abs(change1h) > 12 || Math.abs(change24h) > 40) {
    score -= 12;
    riskFlags.push("GeckoTerminal discovered elevated short-term volatility");
  }

  score = Math.min(80, Math.max(0, Math.round(score)));

  return {
    score,
    grade: gradeFor(score),
    factors,
    riskFlags: [...new Set([...riskFlags, ...signal.warnings])]
  };
}

function candidateFromPool(params: {
  pool: JsonApiResource;
  token: JsonApiResource;
  role: "base" | "quote";
}): GeckoTerminalDiscoveredCandidate | undefined {
  const tokenAddress = tokenAddressFromIncluded(params.token);

  if (!tokenAddress) {
    return undefined;
  }

  const signal = signalFromPool(params.pool, params.role);

  if ((signal.liquidityUsd ?? 0) < 10_000 || (signal.volume24hUsd ?? 0) < 1_000 || (signal.transactions24h ?? 0) < 10) {
    return undefined;
  }

  const score = discoveryScore(signal);

  return {
    tokenAddress,
    symbol: tokenSymbolFromIncluded(params.token),
    name: tokenNameFromIncluded(params.token),
    decimals: 18,
    priceUsd: signal.priceUsd ?? 0,
    source: "geckoterminal_xlayer_discovery",
    activity: {
      liquidityUsd: signal.liquidityUsd ?? 0,
      volume24hUsd: signal.volume24hUsd ?? 0,
      transactions24h: signal.transactions24h ?? 0,
      buys24h: signal.buys24h ?? 0,
      sells24h: signal.sells24h ?? 0
    },
    score,
    research: {
      method: "geckoterminal_xlayer_pool_discovery",
      confidence: signal.confidence,
      notes: [
        "Discovered from live GeckoTerminal X Layer pool data.",
        "Score is capped until AgentFund confirms native X Layer transfer activity or routed Uniswap v4 swap data."
      ]
    },
    external: {
      geckoTerminal: signal
    }
  };
}

function scoreGeckoSignal(signal: GeckoTerminalPoolSignal) {
  const factors: string[] = [];
  const riskFlags: string[] = [];
  let scoreDelta = 0;

  if ((signal.liquidityUsd ?? 0) >= 250_000) {
    scoreDelta += 10;
    factors.push("GeckoTerminal confirms deep X Layer pool liquidity");
  } else if ((signal.liquidityUsd ?? 0) >= 25_000) {
    scoreDelta += 6;
    factors.push("GeckoTerminal confirms usable X Layer pool liquidity");
  } else {
    scoreDelta -= 8;
    riskFlags.push("GeckoTerminal shows thin or missing X Layer pool liquidity");
  }

  if ((signal.volume24hUsd ?? 0) >= 100_000) {
    scoreDelta += 8;
    factors.push("GeckoTerminal confirms strong 24h X Layer volume");
  } else if ((signal.volume24hUsd ?? 0) >= 10_000) {
    scoreDelta += 4;
    factors.push("GeckoTerminal confirms active 24h X Layer volume");
  } else {
    scoreDelta -= 4;
    riskFlags.push("GeckoTerminal 24h volume is weak or unavailable");
  }

  if ((signal.transactions24h ?? 0) >= 500) {
    scoreDelta += 5;
    factors.push("GeckoTerminal shows broad recent pool transaction flow");
  }

  const change1h = signal.priceChange1hPct ?? 0;
  const change24h = signal.priceChange24hPct ?? 0;

  if (change1h > 0 && change24h > 0) {
    scoreDelta += 5;
    factors.push("GeckoTerminal price momentum is positive on 1h and 24h windows");
  }

  if (Math.abs(change1h) > 12 || Math.abs(change24h) > 40) {
    scoreDelta -= 8;
    riskFlags.push("GeckoTerminal flags elevated short-term volatility");
  }

  return {
    scoreDelta,
    factors,
    riskFlags
  };
}

function gradeFor(score: number): MarketOpportunity["score"]["grade"] {
  return score >= 82 ? "high_conviction" : score >= 65 ? "qualified" : score >= 45 ? "watch" : "avoid";
}

function hasNativeRoutedPool(opportunity: MarketOpportunity) {
  return "pool" in opportunity && opportunity.priceUsd > 0 && opportunity.activity.swapCount > 0;
}

function capExternalOnlyScore(opportunity: MarketOpportunity, scoreDelta: number) {
  if (hasNativeRoutedPool(opportunity)) {
    return Math.max(0, Math.min(100, Math.round(opportunity.score.score + scoreDelta)));
  }

  return Math.min(95, Math.max(0, Math.min(100, Math.round(opportunity.score.score + Math.min(scoreDelta, 10)))));
}

export async function enrichWithGeckoTerminal<T extends MarketOpportunity>(opportunities: T[]) {
  if (!enabled() || opportunities.length === 0) {
    return opportunities;
  }

  try {
    const { pools, included } = await getTopPools();

    return opportunities.map((opportunity) => {
      const tokenAddress = opportunity.tokenAddress.toLowerCase();
      const matchedPool = pools.find((pool) => {
        const tokens = poolTokenAddresses(pool, included);

        return tokens.base?.toLowerCase() === tokenAddress || tokens.quote?.toLowerCase() === tokenAddress;
      });

      if (!matchedPool) {
        return {
          ...opportunity,
          external: {
            ...(opportunity as T & GeckoTerminalEnrichment).external,
            geckoTerminal: {
              source: "geckoterminal_xlayer",
              status: "partial",
              network: env.GECKOTERMINAL_NETWORK,
              confidence: "low",
              freshness: {
                updatedAt: new Date().toISOString(),
                cacheTtlMs: GECKOTERMINAL_CACHE_TTL_MS
              },
              warnings: ["Token was not present in GeckoTerminal top X Layer pools page."]
            } satisfies GeckoTerminalPoolSignal
          }
        };
      }

      const tokens = poolTokenAddresses(matchedPool, included);
      const role = tokens.base?.toLowerCase() === tokenAddress ? "base" : "quote";
      const signal = signalFromPool(matchedPool, role);
      const scoring = scoreGeckoSignal(signal);
      const uncappedScore = Math.max(0, Math.min(100, Math.round(opportunity.score.score + scoring.scoreDelta)));
      const score = capExternalOnlyScore(opportunity, scoring.scoreDelta);
      const capRiskFlags =
        score < uncappedScore
          ? ["external pool validation capped below 100 until native Uniswap v4 routed swap data agrees"]
          : [];

      return {
        ...opportunity,
        priceUsd: signal.priceUsd ?? opportunity.priceUsd,
        score: {
          score,
          grade: gradeFor(score),
          factors: [...new Set([...opportunity.score.factors, ...scoring.factors])],
          riskFlags: [
            ...new Set([...opportunity.score.riskFlags, ...scoring.riskFlags, ...signal.warnings, ...capRiskFlags])
          ]
        },
        external: {
          ...(opportunity as T & GeckoTerminalEnrichment).external,
          geckoTerminal: signal
        }
      };
    });
  } catch (error) {
    return opportunities.map((opportunity) => ({
      ...opportunity,
      external: {
        ...(opportunity as T & GeckoTerminalEnrichment).external,
        geckoTerminal: {
          source: "geckoterminal_xlayer",
          status: "failed",
          network: env.GECKOTERMINAL_NETWORK,
          confidence: "low",
          freshness: {
            updatedAt: new Date().toISOString(),
            cacheTtlMs: GECKOTERMINAL_CACHE_TTL_MS
          },
          warnings: [error instanceof Error ? error.message : "GeckoTerminal enrichment failed."]
        } satisfies GeckoTerminalPoolSignal
      }
    }));
  }
}

export async function discoverGeckoTerminalCandidates(limit: number): Promise<GeckoTerminalDiscoveredCandidate[]> {
  if (!enabled()) {
    return [];
  }

  try {
    const { pools, included } = await getTopPools();
    const index = includedById(included);
    const bestByToken = new Map<string, GeckoTerminalDiscoveredCandidate>();

    for (const pool of pools) {
      const base = index.get(getRelationshipId(pool, "base_token") ?? "");
      const quote = index.get(getRelationshipId(pool, "quote_token") ?? "");
      const candidateInputs: Array<{ token: JsonApiResource | undefined; role: "base" | "quote" }> = [
        { token: base, role: "base" },
        { token: quote, role: "quote" }
      ];

      for (const item of candidateInputs) {
        if (!item.token || isQuoteLikeToken(item.token)) {
          continue;
        }

        const candidate = candidateFromPool({
          pool,
          token: item.token,
          role: item.role
        });

        if (!candidate) {
          continue;
        }

        const key = candidate.tokenAddress.toLowerCase();
        const existing = bestByToken.get(key);

        if (!existing || candidate.activity.liquidityUsd > existing.activity.liquidityUsd) {
          bestByToken.set(key, candidate);
        }
      }
    }

    return [...bestByToken.values()].sort((a, b) => b.score.score - a.score.score).slice(0, limit);
  } catch {
    return [];
  }
}
