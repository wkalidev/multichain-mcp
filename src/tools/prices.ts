import { z } from "zod";

const COINGECKO_IDS: Record<string, string> = {
  STX: "blockstack",
  CELO: "celo",
  ETH: "ethereum",
  cUSD: "celo-dollar",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  WBTC: "wrapped-bitcoin",
  OP: "optimism",
  cbBTC: "coinbase-wrapped-btc",
};

export const pricesSchema = z.object({
  symbols: z
    .array(z.string())
    .min(1)
    .max(50)
    .describe("Token symbols to fetch (e.g. ['STX', 'CELO', 'ETH'])"),
  currency: z
    .string()
    .regex(/^[a-zA-Z]{2,10}$/, "Currency must be a 2-10 letter code (e.g. usd, eur)")
    .default("usd")
    .describe("Quote currency (default: usd)"),
});

export type PricesInput = z.infer<typeof pricesSchema>;

export interface TokenPrice {
  symbol: string;
  price: number;
  change24h: number | null;
  currency: string;
}

export async function getPrices(input: PricesInput): Promise<TokenPrice[]> {
  const { symbols, currency } = input;

  const ids = symbols
    .map((s) => COINGECKO_IDS[s.toUpperCase()])
    .filter(Boolean)
    .join(",");

  if (!ids) {
    throw new Error(`No recognized symbols in: ${symbols.join(", ")}`);
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${currency}&include_24hr_change=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
  const data = (await res.json()) as Record<
    string,
    Record<string, number>
  >;

  return symbols
    .filter((s) => COINGECKO_IDS[s.toUpperCase()])
    .map((s) => {
      const id = COINGECKO_IDS[s.toUpperCase()];
      const entry = data[id];
      return {
        symbol: s.toUpperCase(),
        price: entry?.[currency] ?? 0,
        change24h: entry?.[`${currency}_24h_change`] ?? null,
        currency,
      };
    });
}
