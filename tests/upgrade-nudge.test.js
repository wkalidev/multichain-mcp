import { test } from "node:test";
import assert from "node:assert/strict";

import { buildUpgradeNudge, CHECKOUT_URLS } from "../dist/tools/upgrade-nudge.js";

test("nudge for a free user hitting a pro tool points at the pro checkout", () => {
  const nudge = buildUpgradeNudge("get_portfolio", "pro", "free");
  assert.equal(nudge.locked, true);
  assert.equal(nudge.tool, "get_portfolio");
  assert.equal(nudge.requiredTier, "Pro");
  assert.equal(nudge.currentTier, "Free");
  assert.equal(nudge.upgradeUrl, CHECKOUT_URLS.pro);
  assert.match(nudge.message, /requires the Pro tier/);
});

test("nudge for a pro user hitting a team tool points at the team checkout", () => {
  const nudge = buildUpgradeNudge("deploy_token", "team", "pro");
  assert.equal(nudge.requiredTier, "Team");
  assert.equal(nudge.currentTier, "Pro");
  assert.equal(nudge.upgradeUrl, CHECKOUT_URLS.team);
});

test("checkout URLs are the real, live Lemon Squeezy links", () => {
  assert.equal(CHECKOUT_URLS.pro, "https://wkalidev.lemonsqueezy.com/checkout/buy/74e9f10d-3806-413c-881d-761319ee535b");
  assert.equal(CHECKOUT_URLS.team, "https://wkalidev.lemonsqueezy.com/checkout/buy/00764bb0-5d36-4688-832c-f54b95df791f");
});
