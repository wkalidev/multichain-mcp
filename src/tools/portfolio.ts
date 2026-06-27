import { z } from "zod";
import { getBalance, type BalanceResult } from "./balance.js";

export const portfolioSchema = z.object({
  addresses: z
    .object({
      celo: z.string().optional().describe("Celo/EVM address (0x...)"),
      base: z.string().optional().describe("Base address (0x...)"),
      stacks: z.string().optional().describe("Stacks address (SP... or ST...)"),
    })
    .describe("Your wallet addresses per chain"),
});

export type PortfolioInput = z.infer<typeof portfolioSchema>;

export interface PortfolioResult {
  chains: BalanceResult[];
  summary: {
    totalChains: number;
    chainsWithBalance: string[];
    totalNativeAssets: number;
    totalTokens: number;
  };
}

export async function getPortfolio(
  input: PortfolioInput
): Promise<PortfolioResult> {
  const { addresses } = input;
  const results: BalanceResult[] = [];
  const errors: string[] = [];

  const tasks: Promise<void>[] = [];

  if (addresses.celo) {
    tasks.push(
      getBalance({ address: addresses.celo, chain: "celo" })
        .then((r) => { results.push(r); })
        .catch((e) => { errors.push(`Celo: ${e.message}`); })
    );
  }

  if (addresses.base) {
    tasks.push(
      getBalance({ address: addresses.base, chain: "base" })
        .then((r) => { results.push(r); })
        .catch((e) => { errors.push(`Base: ${e.message}`); })
    );
  }

  if (addresses.stacks) {
    tasks.push(
      getBalance({ address: addresses.stacks, chain: "stacks" })
        .then((r) => { results.push(r); })
        .catch((e) => { errors.push(`Stacks: ${e.message}`); })
    );
  }

  await Promise.all(tasks);

  const chainsWithBalance = results
    .filter((r) => parseFloat(r.native.balance) > 0 || r.tokens.length > 0)
    .map((r) => r.chain);

  return {
    chains: results,
    summary: {
      totalChains: results.length,
      chainsWithBalance,
      totalNativeAssets: results.length,
      totalTokens: results.reduce((sum, r) => sum + r.tokens.length, 0),
    },
  };
}
