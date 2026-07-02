import { z } from "zod";
import {
  parseUnits,
  isAddress,
  encodeFunctionData,
  erc20Abi,
  type Hex,
} from "viem";
import { getEvmClient, STACKS_API } from "../chains/config.js";
import { isStacksAddress } from "./balance.js";

export const transferSchema = z.object({
  chain: z.enum(["celo", "base", "stacks"]),
  from: z.string().describe("Sender address"),
  to: z.string().describe("Recipient address"),
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "Amount must be a positive number (e.g. '1.5')")
    .describe("Amount as a string (e.g. '1.5')"),
  tokenAddress: z
    .string()
    .optional()
    .describe("ERC-20/SIP-010 contract address. Omit for native transfer."),
});

export type TransferInput = z.infer<typeof transferSchema>;

export interface UnsignedTx {
  chain: string;
  type: "evm" | "stacks";
  to?: string;
  data?: Hex;
  value?: string;
  nonce?: number;
  gasLimit?: string;
  stacksPayload?: string;
  description: string;
}

export async function prepareTransfer(
  input: TransferInput
): Promise<UnsignedTx> {
  const { chain, from, to, amount, tokenAddress } = input;

  if (chain === "stacks") {
    if (!isStacksAddress(from) || !isStacksAddress(to)) {
      throw new Error("Invalid Stacks address");
    }
    return prepareStacksTransfer(from, to, amount, tokenAddress);
  }

  if (!isAddress(from) || !isAddress(to)) {
    throw new Error("Invalid EVM address");
  }

  return prepareEvmTransfer(
    chain as "celo" | "base",
    from as `0x${string}`,
    to as `0x${string}`,
    amount,
    tokenAddress as `0x${string}` | undefined
  );
}

async function prepareEvmTransfer(
  chain: "celo" | "base",
  from: `0x${string}`,
  to: `0x${string}`,
  amount: string,
  tokenAddress?: `0x${string}`
): Promise<UnsignedTx> {
  const client = getEvmClient(chain);
  const nonce = await client.getTransactionCount({ address: from });

  if (!tokenAddress) {
    const value = parseUnits(amount, 18);
    const gasLimit = await client.estimateGas({ account: from, to, value });
    return {
      chain,
      type: "evm",
      to,
      value: value.toString(),
      nonce,
      gasLimit: gasLimit.toString(),
      description: `Transfer ${amount} native on ${chain} to ${to}`,
    };
  }

  const decimals = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "decimals",
  });
  const parsedAmount = parseUnits(amount, decimals);
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, parsedAmount],
  });
  const gasLimit = await client.estimateGas({
    account: from,
    to: tokenAddress,
    data,
  });

  return {
    chain,
    type: "evm",
    to: tokenAddress,
    data,
    nonce,
    gasLimit: gasLimit.toString(),
    description: `Transfer ${amount} token (${tokenAddress}) on ${chain} to ${to}`,
  };
}

async function prepareStacksTransfer(
  from: string,
  to: string,
  amount: string,
  contractId?: string
): Promise<UnsignedTx> {
  const nonceRes = await fetch(
    `${STACKS_API}/v2/accounts/${from}?proof=0`
  );
  const nonceData = (await nonceRes.json()) as { nonce: number };

  if (!contractId) {
    const microSTX = Math.floor(parseFloat(amount) * 1_000_000);
    return {
      chain: "stacks",
      type: "stacks",
      nonce: nonceData.nonce,
      stacksPayload: JSON.stringify({
        type: "token-transfer",
        recipient: to,
        amount: microSTX,
        memo: "",
      }),
      description: `Transfer ${amount} STX to ${to}`,
    };
  }

  const [contractAddress, contractName, tokenName] = contractId.split(/[.:]/);
  const amountInt = Math.floor(parseFloat(amount) * 1_000_000);

  return {
    chain: "stacks",
    type: "stacks",
    nonce: nonceData.nonce,
    stacksPayload: JSON.stringify({
      type: "contract-call",
      contractAddress,
      contractName,
      functionName: "transfer",
      functionArgs: [amountInt, from, to, null],
      tokenName,
    }),
    description: `Transfer ${amount} ${tokenName ?? contractName} (SIP-010) to ${to}`,
  };
}
