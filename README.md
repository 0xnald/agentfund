# AgentFund

AgentFund is an A2MCP Agent Service Provider for OKX.AI. It exposes fixed-price strategy intelligence services for autonomous finance agents on X Layer mainnet.

The product is intentionally non-custodial: AgentFund sells market scans, opportunity scoring, trade signals, risk checks, NAV calculations, and public agent updates. Users keep custody and approve execution.

## Services

| Service | Purpose | Default price |
| --- | --- | --- |
| `scan_xlayer_market` | Rank X Layer opportunities from Uniswap v4 PoolManager events, swap flow, quote routes, and hook risk | `$0.05` |
| `score_token_opportunity` | Score one token, or auto-select the best current Uniswap v4 pool opportunity | `$0.08` |
| `generate_trade_signal` | Generate a user-controlled trade plan with model reasoning | `$0.10` |
| `risk_check_trade` | Check proposed trade size, liquidity risk, slippage, and volatility | `$0.05` |
| `simulate_strategy_nav` | Mark strategy positions to live token prices | `$0.06` |
| `generate_agent_update_post` | Generate a short X update for the agent with `#okxai` | `$0.03` |

## Endpoints

```txt
GET  /api/health
GET  /api/asp/catalog
GET  /api/asp/manifest
POST /api/asp/:service
```

Production service calls are protected by the official OKX x402 SDK. Unpaid calls return HTTP 402, paid calls retry with the `PAYMENT` header, and successful responses include the `PAYMENT-RESPONSE` settlement receipt. Local payment bypass is allowed only when `AGENTFUND_PAYMENT_MODE=disabled` and `NODE_ENV` is not `production`.

## Environment

Copy `.env.example` to `.env.local` for local development. Set the same keys in Vercel for production.

```txt
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS=0x0b95dF99653f9dA5cBdeaAbeb5B4110dE9D1073a
NEXT_PUBLIC_AGENTFUND_CHAIN_ID=196
NEXT_PUBLIC_AGENTFUND_CHAIN_NAME=X Layer Mainnet
XLAYER_RPC_URL=https://rpc.xlayer.tech
AGENTFUND_WATCHLIST=
UNISWAP_V4_POOL_MANAGER_ADDRESS=0x360e68faccca8ca495c1b759fd9eee466db9fb32
UNISWAP_V4_POSITION_MANAGER_ADDRESS=0xcf1eafc6928dc385a342e7c6491d371d2871458b
UNISWAP_V4_QUOTER_ADDRESS=0x8928074ca1b241d8ec02815881c1af11e8bc5219
UNISWAP_V4_STATE_VIEW_ADDRESS=0x76fd297e2d437cd7f76d50f01afe6160f86e9990
UNISWAP_UNIVERSAL_ROUTER_ADDRESS=0x8b844f885672f333bc0042cb669255f93a4c1e6b
UNISWAP_V4_POOL_DISCOVERY_BLOCKS=10000
UNISWAP_V4_SWAP_SCAN_BLOCKS=1000
UNISWAP_V4_LOG_CHUNK_BLOCKS=100
UNISWAP_V4_LOG_CONCURRENCY=2
UNISWAP_V4_QUOTE_TOKEN_ADDRESSES=0x779ded0c9e1022225f8e0630b35a9b54be713736,0x4ae46a509f6b1d9056937ba4500cb143933d2dc8
LLM_API_KEY=
LLM_BASE_URL=https://router-api.0g.ai/v1
LLM_MODEL=deepseek-v4-flash
LLM_TRUST_MODE=verified
AGENTFUND_PAYMENT_MODE=production
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=
OKX_API_PASSPHRASE=
OKX_BASE_URL=https://web3.okx.com
OKX_SYNC_SETTLE=true
X402_NETWORK=eip155:196
X402_ASSET=0x779ded0c9e1022225f8e0630b35a9b54be713736
X402_ASSET_SYMBOL=USD₮0
X402_RECEIVER=0x0b95dF99653f9dA5cBdeaAbeb5B4110dE9D1073a
```

`scan_xlayer_market` reads Uniswap v4 `Initialize` and `Swap` events directly from the X Layer PoolManager, derives pool price from `sqrtPriceX96`, checks quote routes against configured stable assets, and flags custom hook risk. Services that accept `tokenAddress` also accept `"auto"` to use the current top-ranked on-chain opportunity.

For production x402 settlement, create an OKX Developer Portal API key and set `OKX_API_KEY`, `OKX_SECRET_KEY`, and `OKX_PASSPHRASE`. The receiving wallet is `X402_RECEIVER`. X Layer mainnet must use CAIP-2 network `eip155:196`; supported payment tokens are USD₮0 and USDG.

## Development

```txt
pnpm install
pnpm dev
pnpm test
pnpm build
```

The app is built for Vercel and Next.js App Router.

## OKX.AI Listing Positioning

AgentFund is the strategy engine for autonomous finance agents on X Layer. Other OKX.AI agents can call AgentFund as a paid ASP to scan markets, score token opportunities, generate trade signals, risk-check proposed trades, calculate strategy NAV, and create public agent updates.

AgentFund drives OKX.AI usage through repeatable paid calls, X Layer activity through live market intelligence, and social distribution through transparent strategy posts.
