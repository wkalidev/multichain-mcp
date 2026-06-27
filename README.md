# @wkalidev/multichain-mcp

**The only MCP server that gives AI agents native access to Stacks, Celo, and Base — from a single npm package.**

Connect Claude Desktop, Cursor, or any MCP-compatible AI to 3 blockchains in under 5 minutes.

---

## Why this exists

Building an AI agent that interacts with Web3 today means writing separate integrations for every chain. This package ships a production-ready MCP server with 5 battle-tested tools across Stacks (Bitcoin L2), Celo, and Base — no RPC keys required to start.

---

## Tools included

| Tool | Description | Chains |
|------|-------------|--------|
| `get_balance` | Native + token balances for any wallet | Stacks, Celo, Base |
| `get_portfolio` | Aggregate view across all 3 chains in one call | All |
| `prepare_transfer` | Build unsigned tx for native or ERC-20/SIP-010 transfer | All |
| `get_prices` | Live prices + 24h change (STX, CELO, ETH, USDC, WBTC…) | CoinGecko |
| `deploy_token` | Prepare unsigned ERC-20 deployment tx | Celo, Base |

All write operations return **unsigned transactions** — your users always sign with their own wallet. Non-custodial by design.

---

## Install

```bash
npm install @wkalidev/multichain-mcp
```

---

## Claude Desktop setup

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "multichain": {
      "command": "npx",
      "args": ["-y", "@wkalidev/multichain-mcp"]
    }
  }
}
```

Restart Claude Desktop. Your AI can now read balances and prepare transactions across 3 chains.

---

## Cursor / Windsurf setup

Add to `.cursor/mcp.json` or `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "multichain": {
      "command": "npx",
      "args": ["-y", "@wkalidev/multichain-mcp"]
    }
  }
}
```

---

## Usage examples

### Check Stacks wallet
```
"What tokens does SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR hold on Stacks?"
→ get_balance({ address: "SP2C2YFP...", chain: "stacks" })
```

### Full multichain portfolio
```
"Show me my full portfolio across all chains"
→ get_portfolio({ addresses: { stacks: "SP...", celo: "0x...", base: "0x..." } })
```

### Deploy a token
```
"Deploy a token called GreenDAO with symbol GRN, 1M supply on Base"
→ deploy_token({ chain: "base", name: "GreenDAO", symbol: "GRN", totalSupply: "1000000", ownerAddress: "0x..." })
```

### Live prices
```
"What are the current prices of STX, CELO and ETH?"
→ get_prices({ symbols: ["STX", "CELO", "ETH"] })
```

---

## Networks

| Chain | RPC | Explorer |
|-------|-----|----------|
| Stacks | api.hiro.so (public) | explorer.hiro.so |
| Celo | forno.celo.org (public) | celoscan.io |
| Base | mainnet.base.org (public) | basescan.org |

No API keys required for basic usage.

---

## Programmatic use

```typescript
import { getBalance, getPortfolio, getPrices } from "@wkalidev/multichain-mcp";

const balance = await getBalance({ address: "SP2C2YFP...", chain: "stacks" });
const prices  = await getPrices({ symbols: ["STX", "CELO", "ETH"] });
```

---

## Built by

[@wkalidev](https://github.com/wkalidev) — author of `celobank-agent` (ERC-8004 AI agent, 21 MCP tools on Celo mainnet) and `stacks-quest` (non-custodial DeFi terminal on Stacks Bitcoin L2).

---

## License

MIT
