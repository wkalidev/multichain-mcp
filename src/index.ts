#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getBalance, balanceSchema } from "./tools/balance.js";
import { getPortfolio, portfolioSchema } from "./tools/portfolio.js";
import { prepareTransfer, transferSchema } from "./tools/transfer.js";
import { getPrices, pricesSchema } from "./tools/prices.js";
import { prepareDeployToken, deployTokenSchema } from "./tools/deploy-token.js";
import { resolveTier, tierLabel } from "./license.js";

const server = new McpServer({
  name: "multichain-mcp",
  version: "1.0.0",
});

// Free tier
server.tool(
  "get_balance",
  "Get native and token balances for a wallet on Celo, Base, or Stacks",
  balanceSchema.shape,
  async (args) => {
    try {
      const result = await getBalance(args as z.infer<typeof balanceSchema>);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_prices",
  "Get real-time token prices and 24h change for STX, CELO, ETH, and more",
  pricesSchema.shape,
  async (args) => {
    try {
      const result = await getPrices(args as z.infer<typeof pricesSchema>);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const tier = await resolveTier(process.env.MULTICHAIN_LICENSE_KEY);

  // Pro tier
  if (tier === "pro" || tier === "team") {
    server.tool(
      "get_portfolio",
      "Aggregate wallet balances across Celo, Base, and Stacks in one call",
      portfolioSchema.shape,
      async (args) => {
        try {
          const result = await getPortfolio(
            args as z.infer<typeof portfolioSchema>
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (e) {
          return {
            content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "prepare_transfer",
      "Build an unsigned transaction to transfer native tokens or ERC-20/SIP-010 tokens on any supported chain",
      transferSchema.shape,
      async (args) => {
        try {
          const result = await prepareTransfer(
            args as z.infer<typeof transferSchema>
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (e) {
          return {
            content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // Team tier
  if (tier === "team") {
    server.tool(
      "deploy_token",
      "Prepare an unsigned ERC-20 token deployment transaction on Celo or Base",
      deployTokenSchema.shape,
      async (args) => {
        try {
          const result = await prepareDeployToken(
            args as z.infer<typeof deployTokenSchema>
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (e) {
          return {
            content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`multichain-mcp server running [${tierLabel(tier)}]\n`);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e.message}\n`);
  process.exit(1);
});
