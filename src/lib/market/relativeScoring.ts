import type { MarketOpportunity } from "@/lib/market/snapshot";

function gradeFor(score: number): MarketOpportunity["score"]["grade"] {
  return score >= 82 ? "high_conviction" : score >= 65 ? "qualified" : score >= 45 ? "watch" : "avoid";
}

function geckoSignal(opportunity: MarketOpportunity) {
  return opportunity.external?.geckoTerminal;
}

function percentileRank(value: number, values: number[]) {
  const positiveValues = values.filter((item) => item > 0).sort((a, b) => a - b);

  if (value <= 0 || positiveValues.length <= 1) {
    return 0;
  }

  const lowerOrEqual = positiveValues.filter((item) => item <= value).length;

  return lowerOrEqual / positiveValues.length;
}

function nativeSignalStrength(opportunity: MarketOpportunity) {
  if ("pool" in opportunity) {
    return opportunity.activity.swapCount > 0 ? 1 : 0.5;
  }

  if ("transferCount" in opportunity.activity) {
    const transferPoints = Math.min(0.7, opportunity.activity.transferCount / 100);
    const walletPoints = Math.min(0.3, opportunity.activity.uniqueWallets / 50);

    return transferPoints + walletPoints;
  }

  return 0;
}

function externalSignalStrength(opportunity: MarketOpportunity) {
  const signal = geckoSignal(opportunity);

  if (!signal || signal.status === "failed") {
    return 0;
  }

  return signal.confidence === "high" ? 1 : signal.confidence === "medium" ? 0.65 : 0.35;
}

function sourceAgreementBonus(opportunity: MarketOpportunity) {
  const native = nativeSignalStrength(opportunity);
  const external = externalSignalStrength(opportunity);

  if (native >= 0.65 && external >= 0.65) {
    return 4;
  }

  if (native >= 0.35 && external >= 0.35) {
    return 2;
  }

  return 0;
}

function relativeMetrics(opportunity: MarketOpportunity) {
  const signal = geckoSignal(opportunity);
  const change1h = signal?.priceChange1hPct ?? 0;
  const change24h = signal?.priceChange24hPct ?? 0;

  return {
    liquidityUsd: signal?.liquidityUsd ?? 0,
    volume24hUsd: signal?.volume24hUsd ?? 0,
    transactions24h: signal?.transactions24h ?? 0,
    momentum: change1h > 0 && change24h > 0 ? change1h * 0.35 + change24h * 0.65 : Math.min(change1h, change24h),
    activity:
      "transferCount" in opportunity.activity
        ? opportunity.activity.transferCount + opportunity.activity.uniqueWallets * 2
        : "swapCount" in opportunity.activity
          ? opportunity.activity.swapCount * 8
          : "transactions24h" in opportunity.activity
            ? opportunity.activity.transactions24h
            : 0
  };
}

function relativeDelta(params: {
  opportunity: MarketOpportunity;
  metrics: ReturnType<typeof relativeMetrics>;
  distributions: Record<keyof ReturnType<typeof relativeMetrics>, number[]>;
}) {
  const liquidityRank = percentileRank(params.metrics.liquidityUsd, params.distributions.liquidityUsd);
  const volumeRank = percentileRank(params.metrics.volume24hUsd, params.distributions.volume24hUsd);
  const transactionRank = percentileRank(params.metrics.transactions24h, params.distributions.transactions24h);
  const momentumRank = percentileRank(params.metrics.momentum, params.distributions.momentum);
  const activityRank = percentileRank(params.metrics.activity, params.distributions.activity);
  const relativeBoost =
    liquidityRank * 3.5 + volumeRank * 4 + transactionRank * 3 + momentumRank * 4 + activityRank * 3.5;
  const agreementBoost = sourceAgreementBonus(params.opportunity);
  const crowdedBlueChipPenalty =
    params.opportunity.source === "geckoterminal_xlayer_discovery" && sourceAgreementBonus(params.opportunity) === 0
      ? 3
      : 0;

  return {
    delta: Math.round(relativeBoost + agreementBoost - crowdedBlueChipPenalty),
    factors: [
      liquidityRank >= 0.75 ? "top-quartile X Layer liquidity among current candidates" : undefined,
      volumeRank >= 0.75 ? "top-quartile X Layer 24h volume among current candidates" : undefined,
      transactionRank >= 0.75 ? "top-quartile X Layer pool transaction flow among current candidates" : undefined,
      momentumRank >= 0.75 ? "top-quartile X Layer momentum among current candidates" : undefined,
      activityRank >= 0.75 ? "top-quartile native activity among current candidates" : undefined,
      agreementBoost > 0 ? "native and external source signals agree" : undefined
    ].filter((item): item is string => Boolean(item)),
    riskFlags: [
      crowdedBlueChipPenalty > 0 ? "GeckoTerminal-only discovery has no native AgentFund activity confirmation yet" : undefined
    ].filter((item): item is string => Boolean(item))
  };
}

function capScore(opportunity: MarketOpportunity, score: number) {
  if ("pool" in opportunity && opportunity.activity.swapCount > 0 && externalSignalStrength(opportunity) >= 0.65) {
    return Math.min(100, score);
  }

  if (nativeSignalStrength(opportunity) >= 0.65 && externalSignalStrength(opportunity) >= 0.65) {
    return Math.min(95, score);
  }

  if (externalSignalStrength(opportunity) >= 0.65) {
    return Math.min(88, score);
  }

  return Math.min(82, score);
}

export function applyRelativeScoring(opportunities: MarketOpportunity[]) {
  if (opportunities.length <= 1) {
    return opportunities;
  }

  const metricsByToken = new Map(opportunities.map((opportunity) => [opportunity.tokenAddress.toLowerCase(), relativeMetrics(opportunity)]));
  const distributions = {
    liquidityUsd: [...metricsByToken.values()].map((item) => item.liquidityUsd),
    volume24hUsd: [...metricsByToken.values()].map((item) => item.volume24hUsd),
    transactions24h: [...metricsByToken.values()].map((item) => item.transactions24h),
    momentum: [...metricsByToken.values()].map((item) => item.momentum),
    activity: [...metricsByToken.values()].map((item) => item.activity)
  };

  return opportunities.map((opportunity) => {
    const metrics = metricsByToken.get(opportunity.tokenAddress.toLowerCase()) ?? relativeMetrics(opportunity);
    const relative = relativeDelta({ opportunity, metrics, distributions });
    const score = capScore(opportunity, Math.max(0, Math.min(100, opportunity.score.score + relative.delta)));

    return {
      ...opportunity,
      score: {
        score,
        grade: gradeFor(score),
        factors: [...new Set([...opportunity.score.factors, ...relative.factors])],
        riskFlags: [...new Set([...opportunity.score.riskFlags, ...relative.riskFlags])]
      },
      relativeScore: {
        delta: relative.delta,
        metrics
      }
    };
  });
}
