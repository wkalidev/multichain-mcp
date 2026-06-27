import { z } from "zod";
import { isAddress, formatUnits } from "viem";
import { getEvmClient, STACKS_API, type SupportedChain } from "../chains/config.js";

export const balanceSchema = z.object({
  address: z.string().describe("Wallet address (EVM 0x... or Stacks SP/ST...)"),
  chain: z.enum(["celo", "base", "stacks"]).describe("Target blockchain"),
});

export type BalanceInput = z.infer<typeof balanceSchema>;

export interface BalanceResult {
  chain: SupportedChain;
  address: string;
  native: {
    symbol: string;
    balance: string;
    raw: string;
  };
  tokens: TokenBalance[];
}

export interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  contractAddress: string;
}

export async function getBalance(input: BalanceInput): Promise<BalanceResult> {
  const { address, chain } = input;

  if (chain === "stacks") {
    return getStacksBalance(address);
  }

  if (!isAddress(address)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }

  return getEvmBalance(address, chain);
}

async function getEvmBalance(
  address: `0x${string}`,
  chain: "celo" | "base"
): Promise<BalanceResult> {
  const client = getEvmClient(chain);
  const symbols = { celo: "CELO", base: "ETH" };

  const rawBalance = await client.getBalance({ address });
  const nativeBalance = formatUnits(rawBalance, 18);

  return {
    chain,
    address,
    native: {
      symbol: symbols[chain],
      balance: parseFloat(nativeBalance).toFixed(6),
      raw: rawBalance.toString(),
    },
    tokens: [],
  };
}

async function getStacksBalance(address: string): Promise<BalanceResult> {
  const res = await fetch(`${STACKS_API}/v2/accounts/${address}?proof=0`);
  if (!res.ok) throw new Error(`Stacks API error: ${res.status}`);
  const data = (await res.json()) as { balance: string; locked: string };

  const microSTX = BigInt(data.balance);
  const stxBalance = formatUnits(microSTX, 6);

  const fungibleRes = await fetch(
    `${STACKS_API}/extended/v1/address/${address}/balances`
  );
  const fungibleData = (await fungibleRes.json()) as {
    fungible_tokens?: Record<
      string,
      { balance: string; total_sent: string; total_received: string }
    >;
  };

  const tokens: TokenBalance[] = [];
  if (fungibleData.fungible_tokens) {
    for (const [contractId, tokenData] of Object.entries(
      fungibleData.fungible_tokens
    )) {
      if (BigInt(tokenData.balance) === 0n) continue;
      const parts = contractId.split("::");
      const symbol = parts[1] ?? contractId.split(".")[1] ?? "UNKNOWN";
      tokens.push({
        symbol: symbol.toUpperCase(),
        name: symbol,
        balance: tokenData.balance,
        contractAddress: parts[0],
      });
    }
  }

  return {
    chain: "stacks",
    address,
    native: {
      symbol: "STX",
      balance: parseFloat(stxBalance).toFixed(6),
      raw: data.balance,
    },
    tokens,
  };
}
