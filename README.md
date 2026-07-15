# AgentFund

AgentFund is an A2MCP Agent Service Provider for OKX.AI. It exposes fixed-price strategy intelligence services for autonomous finance agents on X Layer mainnet.

The product is intentionally non-custodial: AgentFund sells market scans, opportunity scoring, trade signals, risk checks, NAV calculations, and public agent updates. Users keep custody and approve execution.

## Services

| Service | Purpose | Default price |
| --- | --- | --- |
| `scan_xlayer_market` | Rank configured X Layer watchlist tokens using live chain and DEX data | `$0.05` |
| `score_token_opportunity` | Score one token using liquidity, turnover, momentum, and risk flags | `$0.08` |
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
AGENTFUND_WATCHLIST=
LLM_API_KEY=
LLM_BASE_URL=https://router-api.0g.ai/v1
LLM_MODEL=deepseek-v4-flash
LLM_TRUST_MODE=verified
AGENTFUND_PAYMENT_MODE=production
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=
OKX_BASE_URL=https://web3.okx.com
OKX_SYNC_SETTLE=true
X402_NETWORK=eip155:196
X402_ASSET=0x779ded0c9e1022225f8e0630b35a9b54be713736
X402_ASSET_SYMBOL=USD₮0
X402_RECEIVER=0x0b95dF99653f9dA5cBdeaAbeb5B4110dE9D1073a
```

`AGENTFUND_WATCHLIST` must be a comma-separated list of real X Layer token addresses before live market scans can return ranked results.

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
