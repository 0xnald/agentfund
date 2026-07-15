export type ScoredPair = {
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
  };
  priceChange?: {
    h24?: number;
    h1?: number;
  };
};

export type OpportunityScore = {
  score: number;
  grade: "avoid" | "watch" | "qualified" | "high_conviction";
  factors: string[];
  riskFlags: string[];
};

export function scorePair(pair: ScoredPair): OpportunityScore {
  const liquidity = pair.liquidity?.usd ?? 0;
  const volume24h = pair.volume?.h24 ?? 0;
  const change1h = pair.priceChange?.h1 ?? 0;
  const change24h = pair.priceChange?.h24 ?? 0;
  const factors: string[] = [];
  const riskFlags: string[] = [];

  let score = 40;

  if (liquidity >= 250_000) {
    score += 20;
    factors.push("deep liquidity");
  } else if (liquidity >= 50_000) {
    score += 10;
    factors.push("usable liquidity");
  } else {
    score -= 18;
    riskFlags.push("thin liquidity");
  }

  if (volume24h >= liquidity * 0.5 && liquidity > 0) {
    score += 14;
    factors.push("healthy turnover");
  } else if (volume24h < 10_000) {
    score -= 10;
    riskFlags.push("low 24h volume");
  }

  if (change1h > 0 && change24h > 0) {
    score += 12;
    factors.push("positive short and daily momentum");
  }

  if (Math.abs(change1h) > 12) {
    score -= 8;
    riskFlags.push("high one-hour volatility");
  }

  if (Math.abs(change24h) > 40) {
    score -= 10;
    riskFlags.push("extreme 24h move");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade =
    score >= 82 ? "high_conviction" : score >= 65 ? "qualified" : score >= 45 ? "watch" : "avoid";

  return {
    score,
    grade,
    factors,
    riskFlags
  };
}

export function confidenceFromScore(score: number) {
  return Number((Math.max(0.1, Math.min(0.95, score / 100))).toFixed(2));
}
