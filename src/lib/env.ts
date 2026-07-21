import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS: z.string().startsWith("0x"),
  NEXT_PUBLIC_AGENTFUND_CHAIN_ID: z.coerce.number().int().positive().default(196),
  NEXT_PUBLIC_AGENTFUND_CHAIN_NAME: z.string().default("X Layer Mainnet"),
  XLAYER_RPC_URL: z.string().url().default("https://rpc.xlayer.tech"),
  AGENTFUND_WATCHLIST: z.string().optional().default(""),
  UNISWAP_V4_POOL_MANAGER_ADDRESS: z
    .string()
    .startsWith("0x")
    .default("0x360e68faccca8ca495c1b759fd9eee466db9fb32"),
  UNISWAP_V4_POSITION_MANAGER_ADDRESS: z
    .string()
    .startsWith("0x")
    .default("0xcf1eafc6928dc385a342e7c6491d371d2871458b"),
  UNISWAP_V4_QUOTER_ADDRESS: z
    .string()
    .startsWith("0x")
    .default("0x8928074ca1b241d8ec02815881c1af11e8bc5219"),
  UNISWAP_V4_STATE_VIEW_ADDRESS: z
    .string()
    .startsWith("0x")
    .default("0x76fd297e2d437cd7f76d50f01afe6160f86e9990"),
  UNISWAP_UNIVERSAL_ROUTER_ADDRESS: z
    .string()
    .startsWith("0x")
    .default("0x8b844f885672f333bc0042cb669255f93a4c1e6b"),
  UNISWAP_V4_POOL_DISCOVERY_BLOCKS: z.coerce.number().int().positive().default(10000),
  UNISWAP_V4_SWAP_SCAN_BLOCKS: z.coerce.number().int().positive().default(1000),
  UNISWAP_V4_LOG_CHUNK_BLOCKS: z.coerce.number().int().positive().max(100).default(100),
  UNISWAP_V4_LOG_CONCURRENCY: z.coerce.number().int().positive().max(20).default(2),
  UNISWAP_V4_QUOTE_TOKEN_ADDRESSES: z
    .string()
    .default("0x779ded0c9e1022225f8e0630b35a9b54be713736,0x4ae46a509f6b1d9056937ba4500cb143933d2dc8"),
  RESEARCH_TRANSFER_SCAN_BLOCKS: z.coerce.number().int().positive().default(1000),
  RESEARCH_LOG_CHUNK_BLOCKS: z.coerce.number().int().positive().max(100).default(100),
  RESEARCH_LOG_CONCURRENCY: z.coerce.number().int().positive().max(20).default(2),
  AGENTFUND_DATA_SOURCES: z.string().default("geckoterminal"),
  AGENTFUND_DATA_SOURCE_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
  GECKOTERMINAL_NETWORK: z.string().default("x-layer"),
  COINGECKO_API_KEY: z.string().optional().default(""),
  COINGECKO_PLATFORM_ID: z.string().optional().default(""),
  DEFILLAMA_CHAIN_SLUG: z.string().default("xlayer"),
  PYTH_PRICE_FEED_MAP: z.string().optional().default("{}"),
  AGENTFUND_MARKET_CACHE_TTL_MS: z.coerce.number().int().positive().default(60000),
  AGENTFUND_MARKET_CACHE_STALE_MS: z.coerce.number().int().positive().default(300000),
  AGENTFUND_MARKET_CACHE_MAX_TOKENS: z.coerce.number().int().positive().max(50).default(10),
  AGENTFUND_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_BASE_URL: z.string().url().default("https://router-api.0g.ai/v1"),
  LLM_MODEL: z.string().default("deepseek-v4-flash"),
  LLM_TRUST_MODE: z.string().default("verified"),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  AGENTFUND_PAYMENT_MODE: z.enum(["production", "disabled"]).default("production"),
  OKX_API_KEY: z.string().optional().default(""),
  OKX_SECRET_KEY: z.string().optional().default(""),
  OKX_PASSPHRASE: z.string().optional().default(""),
  OKX_API_PASSPHRASE: z.string().optional().default(""),
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
  AGENTFUND_WATCHLIST: process.env.AGENTFUND_WATCHLIST,
  UNISWAP_V4_POOL_MANAGER_ADDRESS: process.env.UNISWAP_V4_POOL_MANAGER_ADDRESS,
  UNISWAP_V4_POSITION_MANAGER_ADDRESS: process.env.UNISWAP_V4_POSITION_MANAGER_ADDRESS,
  UNISWAP_V4_QUOTER_ADDRESS: process.env.UNISWAP_V4_QUOTER_ADDRESS,
  UNISWAP_V4_STATE_VIEW_ADDRESS: process.env.UNISWAP_V4_STATE_VIEW_ADDRESS,
  UNISWAP_UNIVERSAL_ROUTER_ADDRESS: process.env.UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
  UNISWAP_V4_POOL_DISCOVERY_BLOCKS: process.env.UNISWAP_V4_POOL_DISCOVERY_BLOCKS ?? process.env.UNISWAP_V4_SCAN_BLOCKS,
  UNISWAP_V4_SWAP_SCAN_BLOCKS: process.env.UNISWAP_V4_SWAP_SCAN_BLOCKS,
  UNISWAP_V4_LOG_CHUNK_BLOCKS: process.env.UNISWAP_V4_LOG_CHUNK_BLOCKS,
  UNISWAP_V4_LOG_CONCURRENCY: process.env.UNISWAP_V4_LOG_CONCURRENCY,
  UNISWAP_V4_QUOTE_TOKEN_ADDRESSES: process.env.UNISWAP_V4_QUOTE_TOKEN_ADDRESSES,
  RESEARCH_TRANSFER_SCAN_BLOCKS: process.env.RESEARCH_TRANSFER_SCAN_BLOCKS,
  RESEARCH_LOG_CHUNK_BLOCKS: process.env.RESEARCH_LOG_CHUNK_BLOCKS,
  RESEARCH_LOG_CONCURRENCY: process.env.RESEARCH_LOG_CONCURRENCY,
  AGENTFUND_DATA_SOURCES: process.env.AGENTFUND_DATA_SOURCES,
  AGENTFUND_DATA_SOURCE_TIMEOUT_MS: process.env.AGENTFUND_DATA_SOURCE_TIMEOUT_MS,
  GECKOTERMINAL_NETWORK: process.env.GECKOTERMINAL_NETWORK,
  COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
  COINGECKO_PLATFORM_ID: process.env.COINGECKO_PLATFORM_ID,
  DEFILLAMA_CHAIN_SLUG: process.env.DEFILLAMA_CHAIN_SLUG,
  PYTH_PRICE_FEED_MAP: process.env.PYTH_PRICE_FEED_MAP,
  AGENTFUND_MARKET_CACHE_TTL_MS: process.env.AGENTFUND_MARKET_CACHE_TTL_MS,
  AGENTFUND_MARKET_CACHE_STALE_MS: process.env.AGENTFUND_MARKET_CACHE_STALE_MS,
  AGENTFUND_MARKET_CACHE_MAX_TOKENS: process.env.AGENTFUND_MARKET_CACHE_MAX_TOKENS,
  AGENTFUND_SERVICE_TIMEOUT_MS: process.env.AGENTFUND_SERVICE_TIMEOUT_MS,
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_BASE_URL: process.env.LLM_BASE_URL,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_TRUST_MODE: process.env.LLM_TRUST_MODE,
  LLM_REQUEST_TIMEOUT_MS: process.env.LLM_REQUEST_TIMEOUT_MS,
  AGENTFUND_PAYMENT_MODE: process.env.AGENTFUND_PAYMENT_MODE,
  OKX_API_KEY: process.env.OKX_API_KEY,
  OKX_SECRET_KEY: process.env.OKX_SECRET_KEY,
  OKX_PASSPHRASE: process.env.OKX_PASSPHRASE,
  OKX_API_PASSPHRASE: process.env.OKX_API_PASSPHRASE,
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
