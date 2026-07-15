import { z } from "zod";

export const scanMarketSchema = z.object({
  strategy: z.string().min(3).default("X Layer momentum"),
  maxTokens: z.number().int().positive().max(20).default(10)
});

export const scoreTokenSchema = z.object({
  tokenAddress: z.string().optional().default("auto"),
  strategy: z.string().min(3).default("X Layer momentum")
});

export const generateTradeSignalSchema = z.object({
  tokenAddress: z.string().optional().default("auto"),
  agentName: z.string().min(2).default("X-Alpha"),
  strategy: z.string().min(3).default("Momentum and liquidity rotation"),
  riskProfile: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
  accountSizeUsd: z.number().positive().optional()
});

export const riskCheckTradeSchema = z.object({
  tokenAddress: z.string().optional().default("auto"),
  side: z.enum(["buy", "sell"]),
  notionalUsd: z.number().positive(),
  maxSlippageBps: z.number().int().positive().max(5000).default(100)
});

export const simulateNavSchema = z.object({
  startingNavUsd: z.number().positive(),
  cashUsd: z.number().min(0).default(0),
  positions: z.array(
    z.object({
      tokenAddress: z.string().optional().default("auto"),
      units: z.number().positive(),
      costBasisUsd: z.number().min(0).optional()
    })
  )
});

export const generatePostSchema = z.object({
  agentName: z.string().min(2).default("X-Alpha"),
  tokenAddress: z.string().optional().default("auto"),
  decision: z.string().min(2),
  reason: z.string().min(4),
  includeHashtag: z.boolean().default(true)
});
