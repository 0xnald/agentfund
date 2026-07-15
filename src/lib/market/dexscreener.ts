import { env } from "@/lib/env";

export type DexScreenerPair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  };
  volume?: {
    h24?: number;
    h6?: number;
    h1?: number;
    m5?: number;
  };
  priceChange?: {
    h24?: number;
    h6?: number;
    h1?: number;
    m5?: number;
  };
};

type TokenPairsResponse = DexScreenerPair[];
type SearchResponse = {
  pairs?: DexScreenerPair[];
};

type TokenProfile = {
  chainId: string;
  tokenAddress: string;
  url?: string;
  description?: string;
};

type TokenBoost = {
  chainId: string;
  tokenAddress: string;
  amount?: number;
  totalAmount?: number;
};

export async function fetchTokenPairs(tokenAddress: `0x${string}`): Promise<DexScreenerPair[]> {
  const response = await fetch(
    `https://api.dexscreener.com/token-pairs/v1/${env.DEXSCREENER_CHAIN_ID}/${tokenAddress}`,
    {
      headers: {
        accept: "application/json"
      },
      next: {
        revalidate: 30
      }
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`DexScreener token-pairs request failed: ${response.status} ${detail}`);
  }

  const pairs = (await response.json()) as TokenPairsResponse;
  return pairs.filter((pair) => pair.chainId.toLowerCase() === env.DEXSCREENER_CHAIN_ID.toLowerCase());
}

export function pickPrimaryPair(pairs: DexScreenerPair[]) {
  return [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

export async function searchPairs(query: string): Promise<DexScreenerPair[]> {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`, {
    headers: {
      accept: "application/json"
    },
    next: {
      revalidate: 30
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`DexScreener search request failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as SearchResponse;
  return (payload.pairs ?? []).filter(
    (pair) => pair.chainId.toLowerCase() === env.DEXSCREENER_CHAIN_ID.toLowerCase()
  );
}

export async function fetchLatestTokenProfiles(): Promise<TokenProfile[]> {
  const response = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", {
    headers: {
      accept: "application/json"
    },
    next: {
      revalidate: 60
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`DexScreener token profile request failed: ${response.status} ${detail}`);
  }

  const profiles = (await response.json()) as TokenProfile[];
  return profiles.filter((profile) => profile.chainId.toLowerCase() === env.DEXSCREENER_CHAIN_ID.toLowerCase());
}

export async function fetchLatestTokenBoosts(): Promise<TokenBoost[]> {
  const response = await fetch("https://api.dexscreener.com/token-boosts/latest/v1", {
    headers: {
      accept: "application/json"
    },
    next: {
      revalidate: 60
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`DexScreener token boost request failed: ${response.status} ${detail}`);
  }

  const boosts = (await response.json()) as TokenBoost[];
  return boosts.filter((boost) => boost.chainId.toLowerCase() === env.DEXSCREENER_CHAIN_ID.toLowerCase());
}

export function discoveryQueries() {
  return env.AGENTFUND_DISCOVERY_QUERIES.split(",")
    .map((query) => query.trim())
    .filter(Boolean);
}
