import { describe } from "bun:test";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { encodeFunctionResult, ESCROW_ABI } from "@bloody-roar/shared";
import { loadConfig } from "../src/config";
import { runAutoClaim } from "../src/jobs/auto-claim";
import type { JobContext } from "../src/runtime/scheduler";

describe.skipIf(!process.env.TEST_DATABASE_URL)("database", () => {

const address = () => `0x${randomBytes(20).toString("hex")}`;
const wallets = Array.from({ length: 5 }, address), contract = address();
const config = loadConfig({ RPC_URL: "http://localhost:8545", CHAIN_ID: "31337", ESCROW_ADDRESS: contract, ESCROW_DEPLOY_BLOCK: "0", DATABASE_URL: "postgresql://localhost/review_test", RELAYER_PRIVATE_KEY: `0x${"11".repeat(32)}` });
beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
afterAll(async () => {
  await prisma.claimableBalance.deleteMany({ where: { chainId: 31337, contractAddress: contract } });
  await prisma.user.deleteMany({ where: { walletAddress: { in: wallets.map((w) => w.toUpperCase().replace("0X", "0x")) } } });
  await prisma.$disconnect();
});
test("selects registered mixed-case wallets, excluding fees, zero balances and recent failed attempts", async () => {
  const now = new Date();
  for (const wallet of wallets.slice(0, 4)) await prisma.user.create({ data: { walletAddress: wallet.toUpperCase().replace("0X", "0x") } });
  for (const [n, wallet] of wallets.entries()) await prisma.claimableBalance.create({ data: { chainId: 31337, contractAddress: contract, address: wallet, amountRaw: n === 3 ? "0" : "100", ...(n === 2 ? { autoClaimAt: now } : {}) } });
  let getters = 0;
  const ctx = { db: prisma, config, now: () => now, log: { info() {}, warn() {}, error() {} }, rpc: { call: async () => ++getters === 1 ? encodeFunctionResult({ abi: ESCROW_ABI, functionName: "feeRecipient", result: wallets[0] as `0x${string}` }) : encodeFunctionResult({ abi: ESCROW_ABI, functionName: "claimable", result: 100n }) } } as unknown as JobContext;
  const sent: string[] = [];
  await runAutoClaim(ctx, async (wallet) => { sent.push(wallet); return "0xabc"; });
  expect(sent).toEqual([wallets[1]!]);
  expect(await prisma.claimableBalance.findFirst({ where: { contractAddress: contract, address: wallets[1]! } })).toMatchObject({ autoClaimTxHash: "0xabc", autoClaimAt: now });
});

});
