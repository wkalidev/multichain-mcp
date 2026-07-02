import type { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tierLabel, type Tier } from "../license.js";

export type LockedTier = "pro" | "team";

export const CHECKOUT_URLS: Record<LockedTier, string> = {
  pro: "https://wkalidev.lemonsqueezy.com/checkout/buy/74e9f10d-3806-413c-881d-761319ee535b",
  team: "https://wkalidev.lemonsqueezy.com/checkout/buy/00764bb0-5d36-4688-832c-f54b95df791f",
};

export interface UpgradeNudge {
  locked: true;
  tool: string;
  requiredTier: string;
  currentTier: string;
  message: string;
  upgradeUrl: string;
}

export function buildUpgradeNudge(
  name: string,
  requiredTier: LockedTier,
  currentTier: Tier
): UpgradeNudge {
  return {
    locked: true,
    tool: name,
    requiredTier: tierLabel(requiredTier),
    currentTier: tierLabel(currentTier),
    message: `${name} requires the ${tierLabel(requiredTier)} tier. You're currently on ${tierLabel(currentTier)}. Upgrade to unlock it.`,
    upgradeUrl: CHECKOUT_URLS[requiredTier],
  };
}

export function registerUpgradeNudge(
  server: McpServer,
  name: string,
  description: string,
  shape: z.ZodRawShape,
  requiredTier: LockedTier,
  currentTier: Tier
): void {
  server.tool(
    name,
    `${description} (requires ${tierLabel(requiredTier)} — you're on ${tierLabel(currentTier)})`,
    shape,
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(buildUpgradeNudge(name, requiredTier, currentTier), null, 2),
        },
      ],
    })
  );
}
