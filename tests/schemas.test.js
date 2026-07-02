import { test } from "node:test";
import assert from "node:assert/strict";

import { balanceSchema, isStacksAddress } from "../dist/tools/balance.js";
import { transferSchema } from "../dist/tools/transfer.js";
import { pricesSchema } from "../dist/tools/prices.js";
import { deployTokenSchema } from "../dist/tools/deploy-token.js";

const EVM_ADDR = "0x0000000000000000000000000000000000dEaD";
const STACKS_ADDR = "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR";

test("isStacksAddress accepts valid, rejects garbage", () => {
  assert.equal(isStacksAddress(STACKS_ADDR), true);
  assert.equal(isStacksAddress("not-a-stacks-addr"), false);
  assert.equal(isStacksAddress(EVM_ADDR), false);
});

test("balanceSchema rejects unknown chain", () => {
  assert.equal(
    balanceSchema.safeParse({ address: EVM_ADDR, chain: "solana" }).success,
    false
  );
  assert.equal(
    balanceSchema.safeParse({ address: EVM_ADDR, chain: "base" }).success,
    true
  );
});

test("transferSchema rejects negative/garbage amounts, accepts valid ones", () => {
  const base = { chain: "base", from: EVM_ADDR, to: EVM_ADDR };
  assert.equal(transferSchema.safeParse({ ...base, amount: "-5" }).success, false);
  assert.equal(transferSchema.safeParse({ ...base, amount: "abc" }).success, false);
  assert.equal(transferSchema.safeParse({ ...base, amount: "1.5" }).success, true);
  assert.equal(transferSchema.safeParse({ ...base, amount: "0" }).success, true);
});

test("pricesSchema blocks query-string injection via currency", () => {
  assert.equal(
    pricesSchema.safeParse({ symbols: ["STX"], currency: "usd&x=1" }).success,
    false
  );
  assert.equal(
    pricesSchema.safeParse({ symbols: ["STX"], currency: "eur" }).success,
    true
  );
  assert.equal(pricesSchema.safeParse({ symbols: [] }).success, false);
});

test("deployTokenSchema bounds name length and validates totalSupply", () => {
  const base = { chain: "base", symbol: "MTK", ownerAddress: EVM_ADDR };
  assert.equal(
    deployTokenSchema.safeParse({ ...base, name: "x".repeat(200), totalSupply: "1000" }).success,
    false
  );
  assert.equal(
    deployTokenSchema.safeParse({ ...base, name: "Token", totalSupply: "-1" }).success,
    false
  );
  assert.equal(
    deployTokenSchema.safeParse({ ...base, name: "Token", totalSupply: "1000000" }).success,
    true
  );
});
