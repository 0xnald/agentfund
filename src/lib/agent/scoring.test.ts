import { describe, expect, it } from "vitest";
import { scorePair } from "./scoring";
import { DexScreenerPair } from "../market/dexscreener";

const basePair: DexScreenerPair = {
  chainId: "xlayer",
  dexId: "test",
  url: "https://example.com",
  pairAddress: "0xpair",
  baseToken: {
    address: "0xtoken",
    name: "Token",
    symbol: "TOK"
  },
  quoteToken: {
    address: "0xquote",
    name: "OKB",
    symbol: "OKB"
  },
  liquidity: {
    usd: 300_000
  },
  volume: {
    h24: 200_000
  },
  priceChange: {
    h1: 2,
    h24: 8
  }
};

describe("scorePair", () => {
  it("rewards liquid pairs with healthy turnover and positive momentum", () => {
    const score = scorePair(basePair);

    expect(score.grade).toBe("high_conviction");
    expect(score.score).toBeGreaterThanOrEqual(82);
    expect(score.factors).toContain("deep liquidity");
  });

  it("flags thin liquidity and extreme moves", () => {
    const score = scorePair({
      ...basePair,
      liquidity: {
        usd: 4_000
      },
      volume: {
        h24: 500
      },
      priceChange: {
        h1: 18,
        h24: 72
      }
    });

    expect(score.grade).toBe("avoid");
    expect(score.riskFlags).toContain("thin liquidity");
    expect(score.riskFlags).toContain("extreme 24h move");
  });
});
