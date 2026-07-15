import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

export type OkxDexToken = {
  chainIndex?: string;
  tokenContractAddress?: string;
  tokenSymbol?: string;
  tokenName?: string;
  decimals?: string;
  tokenLogoUrl?: string;
};

export type OkxRouteQuote = {
  fromTokenAmount?: string;
  toTokenAmount?: string;
  priceImpactPercentage?: string;
  tradeFee?: string;
  estimatedPriceUsd?: number;
  dexRouterList?: unknown[];
  quoteCompareList?: unknown[];
  routerResult?: Record<string, unknown>;
  raw: unknown;
};

export type OkxOpportunity = {
  tokenAddress: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  quote: OkxRouteQuote;
  score: {
    score: number;
    grade: "avoid" | "watch" | "qualified" | "high_conviction";
    factors: string[];
    riskFlags: string[];
  };
};

type OkxResponse<T> = {
  code?: string;
  msg?: string;
  data?: T[];
};

function okxCredentialsAvailable() {
  return Boolean(env.OKX_API_KEY && env.OKX_SECRET_KEY && okxPassphrase());
}

function okxPassphrase() {
  return env.OKX_PASSPHRASE || env.OKX_API_PASSPHRASE;
}

function okxProjectId() {
  return env.OKX_DEX_PROJECT_ID || env.NEXT_PUBLIC_OKX_PROJECT_ID;
}

function sign(timestamp: string, method: string, requestPath: string, body = "") {
  const prehash = `${timestamp}${method.toUpperCase()}${requestPath}${body}`;
  return createHmac("sha256", env.OKX_SECRET_KEY).update(prehash).digest("base64");
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const value = search.toString();
  return value ? `?${value}` : "";
}

async function okxGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T[]> {
  if (!okxCredentialsAvailable()) {
    throw new Error(
      "OKX DEX API credentials are not configured. Set OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE or OKX_API_PASSPHRASE."
    );
  }

  const requestPath = `${path}${queryString(params)}`;
  const timestamp = new Date().toISOString();
  let response: Response;

  try {
    response = await fetch(`${env.OKX_DEX_API_BASE_URL}${requestPath}`, {
      headers: {
        accept: "application/json",
        "OK-ACCESS-KEY": env.OKX_API_KEY,
        "OK-ACCESS-SIGN": sign(timestamp, "GET", requestPath),
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": okxPassphrase(),
        ...(okxProjectId() ? { "OK-ACCESS-PROJECT-ID": okxProjectId() } : {})
      },
      next: {
        revalidate: 20
      },
      signal: AbortSignal.timeout(env.OKX_DEX_TIMEOUT_MS)
    });
  } catch (error) {
    const cause =
      error instanceof Error && "cause" in error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
    const message = error instanceof Error ? `${error.message}${cause}` : "unknown network error";
    throw new Error(`OKX DEX API network request failed for ${requestPath}: ${message}`);
  }

  const payload = (await response.json().catch(() => ({}))) as OkxResponse<T>;

  if (!response.ok || (payload.code && payload.code !== "0")) {
    throw new Error(`OKX DEX API request failed: ${response.status} ${payload.code ?? ""} ${payload.msg ?? ""}`.trim());
  }

  return payload.data ?? [];
}

export async function fetchOkxDexTokens() {
  return okxGet<OkxDexToken>(env.OKX_DEX_TOKENS_PATH, {
    chainIndex: env.OKX_DEX_CHAIN_INDEX
  });
}

export async function fetchOkxDexQuote(params: {
  fromTokenAddress: string;
  toTokenAddress?: string;
  amount: string;
}) {
  const data = await okxGet<Record<string, unknown>>(env.OKX_DEX_QUOTE_PATH, {
    chainIndex: env.OKX_DEX_CHAIN_INDEX,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress ?? env.OKX_DEX_QUOTE_TOKEN_ADDRESS,
    amount: params.amount
  });
  const first = data[0] ?? {};
  const routerResult =
    typeof first.routerResult === "object" && first.routerResult
      ? (first.routerResult as Record<string, unknown>)
      : {};

  return {
    fromTokenAmount: String(first.fromTokenAmount ?? ""),
    toTokenAmount: String(first.toTokenAmount ?? ""),
    priceImpactPercentage: String(first.priceImpactPercentage ?? ""),
    tradeFee: String(first.tradeFee ?? ""),
    estimatedPriceUsd: estimateQuotePriceUsd(first),
    dexRouterList: Array.isArray(first.dexRouterList) ? first.dexRouterList : [],
    quoteCompareList: Array.isArray(first.quoteCompareList) ? first.quoteCompareList : [],
    routerResult,
    raw: first
  } satisfies OkxRouteQuote;
}

function estimateQuotePriceUsd(raw: Record<string, unknown>) {
  const direct = Number(raw.fromTokenPriceUsd ?? raw.fromTokenPrice ?? raw.priceUsd ?? raw.dexTokenPriceUsd);

  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  return undefined;
}

function wholeTokenAmount(decimals: number) {
  return 10n ** BigInt(Math.max(0, decimals));
}

export function scoreOkxQuote(quote: OkxRouteQuote) {
  const toAmount = Number(quote.toTokenAmount ?? 0);
  const priceImpact = Math.abs(Number(quote.priceImpactPercentage ?? 0));
  const routeCount = quote.dexRouterList?.length ?? 0;
  const compareCount = quote.quoteCompareList?.length ?? 0;
  const factors: string[] = [];
  const riskFlags: string[] = [];
  let score = 42;

  if (toAmount > 0) {
    score += 18;
    factors.push("OKX route returns executable quote");
  } else {
    score -= 24;
    riskFlags.push("no executable OKX quote amount");
  }

  if (routeCount > 0) {
    score += Math.min(18, routeCount * 6);
    factors.push("OKX DEX router found liquidity source");
  } else {
    riskFlags.push("no visible OKX router liquidity source");
  }

  if (compareCount > 0) {
    score += Math.min(10, compareCount * 3);
    factors.push("multiple OKX quote routes available");
  }

  if (quote.estimatedPriceUsd && quote.estimatedPriceUsd > 0) {
    score += 8;
    factors.push("OKX quote includes USD mark context");
  }

  if (Number.isFinite(priceImpact) && priceImpact > 0) {
    if (priceImpact <= 2) {
      score += 12;
      factors.push("low quote price impact");
    } else if (priceImpact <= 8) {
      score += 4;
      riskFlags.push("moderate price impact");
    } else {
      score -= 12;
      riskFlags.push("high price impact");
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade: OkxOpportunity["score"]["grade"] =
    score >= 82 ? "high_conviction" : score >= 65 ? "qualified" : score >= 45 ? "watch" : "avoid";

  return { score, grade, factors, riskFlags };
}

export async function discoverOkxDexOpportunities(limit: number) {
  const tokens = await fetchOkxDexTokens();
  const quoteToken = env.OKX_DEX_QUOTE_TOKEN_ADDRESS.toLowerCase();
  const candidates = tokens
    .filter((token) => token.tokenContractAddress?.startsWith("0x"))
    .filter((token) => token.tokenContractAddress?.toLowerCase() !== quoteToken)
    .filter((token) => Number(token.decimals ?? 18) >= 0)
    .slice(0, Math.max(limit * 4, limit));

  const opportunities = await Promise.all(
    candidates.map(async (token) => {
      const tokenAddress = token.tokenContractAddress as `0x${string}`;
      const decimals = Number(token.decimals ?? 18);
      try {
        const quote = await fetchOkxDexQuote({
          fromTokenAddress: tokenAddress,
          amount: wholeTokenAmount(decimals).toString()
        });

        return {
          tokenAddress,
          symbol: token.tokenSymbol ?? "UNKNOWN",
          name: token.tokenName ?? token.tokenSymbol ?? "Unknown token",
          decimals,
          quote,
          score: scoreOkxQuote(quote)
        } satisfies OkxOpportunity;
      } catch {
        return undefined;
      }
    })
  );

  return opportunities
    .filter((opportunity) => opportunity !== undefined)
    .filter((opportunity) => Number(opportunity.quote.toTokenAmount ?? 0) > 0)
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, limit);
}
