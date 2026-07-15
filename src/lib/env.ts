import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS: z.string().startsWith("0x"),
  NEXT_PUBLIC_AGENTFUND_CHAIN_ID: z.coerce.number().int().positive().default(196),
  NEXT_PUBLIC_AGENTFUND_CHAIN_NAME: z.string().default("X Layer Mainnet"),
  XLAYER_RPC_URL: z.string().url().default("https://rpc.xlayer.tech"),
  DEXSCREENER_CHAIN_ID: z.string().default("xlayer"),
  AGENTFUND_DISCOVERY_QUERIES: z.string().optional().default("xlayer,okx,okb"),
  AGENTFUND_WATCHLIST: z.string().optional().default(""),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_BASE_URL: z.string().url().default("https://router-api.0g.ai/v1"),
  LLM_MODEL: z.string().default("deepseek-v4-flash"),
  LLM_TRUST_MODE: z.string().default("verified"),
  AGENTFUND_PAYMENT_MODE: z.enum(["production", "disabled"]).default("production"),
  OKX_API_KEY: z.string().optional().default(""),
  OKX_SECRET_KEY: z.string().optional().default(""),
  OKX_PASSPHRASE: z.string().optional().default(""),
  OKX_BASE_URL: z.string().url().default("https://web3.okx.com"),
  OKX_SYNC_SETTLE: z
    .string()
    .optional()
    .default("true")
    .transform((value) => value === "true"),
  X402_NETWORK: z.string().default("eip155:196"),
  X402_ASSET: z.string().startsWith("0x").default("0x779ded0c9e1022225f8e0630b35a9b54be713736"),
  X402_ASSET_SYMBOL: z.string().default("USD₮0"),
  X402_RECEIVER: z.string().startsWith("0x"),
  PRICE_SCAN_XLAYER_MARKET: z.string().default("0.05"),
  PRICE_SCORE_TOKEN_OPPORTUNITY: z.string().default("0.08"),
  PRICE_GENERATE_TRADE_SIGNAL: z.string().default("0.10"),
  PRICE_RISK_CHECK_TRADE: z.string().default("0.05"),
  PRICE_SIMULATE_STRATEGY_NAV: z.string().default("0.06"),
  PRICE_GENERATE_AGENT_UPDATE_POST: z.string().default("0.03")
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS:
    process.env.NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS ?? "0x0b95dF99653f9dA5cBdeaAbeb5B4110dE9D1073a",
  NEXT_PUBLIC_AGENTFUND_CHAIN_ID: process.env.NEXT_PUBLIC_AGENTFUND_CHAIN_ID,
  NEXT_PUBLIC_AGENTFUND_CHAIN_NAME: process.env.NEXT_PUBLIC_AGENTFUND_CHAIN_NAME,
  XLAYER_RPC_URL: process.env.XLAYER_RPC_URL,
  DEXSCREENER_CHAIN_ID: process.env.DEXSCREENER_CHAIN_ID,
  AGENTFUND_DISCOVERY_QUERIES: process.env.AGENTFUND_DISCOVERY_QUERIES,
  AGENTFUND_WATCHLIST: process.env.AGENTFUND_WATCHLIST,
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_BASE_URL: process.env.LLM_BASE_URL,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_TRUST_MODE: process.env.LLM_TRUST_MODE,
  AGENTFUND_PAYMENT_MODE: process.env.AGENTFUND_PAYMENT_MODE,
  OKX_API_KEY: process.env.OKX_API_KEY,
  OKX_SECRET_KEY: process.env.OKX_SECRET_KEY,
  OKX_PASSPHRASE: process.env.OKX_PASSPHRASE,
  OKX_BASE_URL: process.env.OKX_BASE_URL,
  OKX_SYNC_SETTLE: process.env.OKX_SYNC_SETTLE,
  X402_NETWORK: process.env.X402_NETWORK,
  X402_ASSET: process.env.X402_ASSET,
  X402_ASSET_SYMBOL: process.env.X402_ASSET_SYMBOL,
  X402_RECEIVER: process.env.X402_RECEIVER ?? process.env.NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS ?? "0x0b95dF99653f9dA5cBdeaAbeb5B4110dE9D1073a",
  PRICE_SCAN_XLAYER_MARKET: process.env.PRICE_SCAN_XLAYER_MARKET,
  PRICE_SCORE_TOKEN_OPPORTUNITY: process.env.PRICE_SCORE_TOKEN_OPPORTUNITY,
  PRICE_GENERATE_TRADE_SIGNAL: process.env.PRICE_GENERATE_TRADE_SIGNAL,
  PRICE_RISK_CHECK_TRADE: process.env.PRICE_RISK_CHECK_TRADE,
  PRICE_SIMULATE_STRATEGY_NAV: process.env.PRICE_SIMULATE_STRATEGY_NAV,
  PRICE_GENERATE_AGENT_UPDATE_POST: process.env.PRICE_GENERATE_AGENT_UPDATE_POST
});
