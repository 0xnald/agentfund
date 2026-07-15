# OKX.AI ASP Listing

## Name

AgentFund

## Type

A2MCP

## Short Description

Paid strategy intelligence for autonomous finance agents on X Layer.

## Full Description

AgentFund lets OKX.AI agents call fixed-price services for X Layer market scans, token opportunity scoring, user-controlled trade signals, risk checks, NAV simulation, and public strategy updates.

AgentFund does not custody user funds and does not pool capital. It provides intelligence and execution plans that users or calling agents can review before acting.

## Why It Matters

AgentFund gives OKX.AI a real revenue-generating finance ASP. Each strategy agent can repeatedly call AgentFund for scans, risk checks, trade plans, and updates. This creates marketplace activity, supports X Layer market discovery, and gives users a transparent way to evaluate agent-generated strategies.

## Service List

| Service | Price | Description |
| --- | --- | --- |
| `scan_xlayer_market` | `$0.05` | Reads Uniswap v4 X Layer PoolManager events and ranks pools by swap flow, quote route, liquidity, fee tier, and hook risk. |
| `score_token_opportunity` | `$0.08` | Scores one token, or auto-selects the best current Uniswap v4 pool opportunity, using on-chain pool data. |
| `generate_trade_signal` | `$0.10` | Generates a trade thesis, confidence score, invalidation, sizing note, and risk summary. |
| `risk_check_trade` | `$0.05` | Checks trade size, visible liquidity, slippage settings, and volatility risk before user approval. |
| `simulate_strategy_nav` | `$0.06` | Marks a caller-supplied strategy portfolio using live X Layer token prices. |
| `generate_agent_update_post` | `$0.03` | Generates concise X-ready strategy updates with `#okxai`. |

## Demo Flow

1. Open the AgentFund terminal.
2. Show the ASP catalog.
3. Call a paid service; unpaid requests return HTTP 402, then Agentic Wallet retries with the `PAYMENT` header.
4. Generate a market scan or token score from live X Layer data.
5. Generate a trade signal that explicitly remains user-approved.
6. Generate an X post for the strategy agent.

## Required Production Configuration

- Vercel deployment URL in `NEXT_PUBLIC_SITE_URL`
- X Layer mainnet RPC in `XLAYER_RPC_URL`
- Uniswap v4 X Layer contract configuration: PoolManager, StateView, Quoter, Universal Router, and quote token list
- 0G router key in `LLM_API_KEY`
- OKX Developer Portal credentials in `OKX_API_KEY`, `OKX_SECRET_KEY`, and `OKX_PASSPHRASE`
- x402 network set to `eip155:196`
- payment token set to X Layer USD₮0, `0x779ded0c9e1022225f8e0630b35a9b54be713736`, or USDG if configured

## Submission Tags

`#okxai`, `A2MCP`, `X Layer`, `Finance Copilot`, `Business Potential`, `Revenue Rocket`
