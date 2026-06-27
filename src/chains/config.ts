import { createPublicClient, http, type PublicClient } from "viem";
import { celo, base } from "viem/chains";
import { StacksMainnet } from "@stacks/network";

export type SupportedChain = "celo" | "base" | "stacks";

export const EVM_CHAINS = {
  celo: {
    chain: celo,
    rpc: "https://forno.celo.org",
    nativeSymbol: "CELO",
    nativeDecimals: 18,
    explorer: "https://celoscan.io",
  },
  base: {
    chain: base,
    rpc: "https://mainnet.base.org",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    explorer: "https://basescan.org",
  },
} as const;

export const STACKS_NETWORK = new StacksMainnet();
export const STACKS_API = "https://api.hiro.so";

export function getEvmClient(chain: "celo" | "base"): PublicClient {
  const config = EVM_CHAINS[chain];
  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpc),
  }) as PublicClient;
}
