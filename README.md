# AgentFund

AgentFund is an A2MCP Agent Service Provider for OKX.AI. It exposes fixed-price strategy intelligence services for autonomous finance agents on X Layer mainnet.

The product is intentionally non-custodial: AgentFund sells market scans, opportunity scoring, trade signals, risk checks, NAV calculations, and public agent updates. Users keep custody and approve execution.

## Services

| Service | Purpose | Default price |
| --- | --- | --- |
| `scan_xlayer_market` | Rank X Layer opportunities from OKX DEX Aggregator token discovery and executable route quotes | `$0.05` |
| `score_token_opportunity` | Score one token, or auto-select the best current route, using OKX quote quality and risk flags | `$0.08` |
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
DEXSCREENER_CHAIN_ID=xlayer
AGENTFUND_DISCOVERY_QUERIES=xlayer,okx,okb
AGENTFUND_WATCHLIST=
OKX_DEX_API_BASE_URL=https://web3.okx.com
OKX_DEX_CHAIN_INDEX=196
OKX_DEX_PROJECT_ID=
NEXT_PUBLIC_OKX_PROJECT_ID=
OKX_DEX_QUOTE_TOKEN_ADDRESS=0x779ded0c9e1022225f8e0630b35a9b54be713736
OKX_DEX_TOKENS_PATH=/api/v6/dex/aggregator/all-tokens
OKX_DEX_QUOTE_PATH=/api/v6/dex/aggregator/quote
OKX_DEX_SWAP_PATH=/api/v6/dex/aggregator/swap
OKX_DEX_CHAIN_DATA_PATH=/api/v6/dex/aggregator/get-chain-data
OKX_DEX_TIMEOUT_MS=15000
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

`scan_xlayer_market` discovers X Layer candidates from OKX DEX Aggregator `all-tokens`, requests executable OKX route quotes, and ranks the best opportunities by route availability, route diversity, USD mark context, and price impact. Services that accept `tokenAddress` also accept `"auto"` to use the current top-ranked OKX route.

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
