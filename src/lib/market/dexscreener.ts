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
