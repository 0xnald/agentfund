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
| `scan_xlayer_market` | `$0.05` | Reads configured X Layer watchlist tokens and returns live liquidity, volume, momentum, and risk context. |
| `score_token_opportunity` | `$0.08` | Scores one token using DEX liquidity, turnover, volatility, and strategy fit. |
| `generate_trade_signal` | `$0.10` | Generates a trade thesis, confidence score, invalidation, sizing note, and risk summary. |
| `risk_check_trade` | `$0.05` | Checks trade size, visible liquidity, slippage settings, and volatility risk before user approval. |
| `simulate_strategy_nav` | `$0.06` | Marks a caller-supplied strategy portfolio using live X Layer token prices. |
| `generate_agent_update_post` | `$0.03` | Generates concise X-ready strategy updates with `#okxai`. |

## Demo Flow

1. Open the AgentFund terminal.
2. Show the ASP catalog.
3. Call a paid service with an `X-PAYMENT` header.
4. Generate a market scan or token score from live X Layer data.
5. Generate a trade signal that explicitly remains user-approved.
6. Generate an X post for the strategy agent.

## Required Production Configuration

- Vercel deployment URL in `NEXT_PUBLIC_SITE_URL`
- X Layer mainnet RPC in `XLAYER_RPC_URL`
- Real X Layer watchlist token addresses in `AGENTFUND_WATCHLIST`
- 0G router key in `LLM_API_KEY`
- OKX Payment SDK verification endpoint in `OKX_PAYMENT_VERIFY_URL`
- OKX payment credentials in `OKX_PAYMENT_API_KEY`

## Submission Tags

`#okxai`, `A2MCP`, `X Layer`, `Finance Copilot`, `Business Potential`, `Revenue Rocket`
