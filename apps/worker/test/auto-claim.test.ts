import { expect, test } from "bun:test";
import { encodeFunctionResult, ESCROW_ABI } from "@bloody-roar/shared";
import { runAutoClaim } from "../src/jobs/auto-claim";
import { loadConfig } from "../src/config";
import type { JobContext } from "../src/runtime/scheduler";

const address = `0x${"11".repeat(20)}`;
function context(key = `0x${"11".repeat(32)}`, balance = 5n) {
  const updates: unknown[] = [], sent: string[] = [];
  const config = loadConfig({ RPC_URL: "http://localhost:8545", CHAIN_ID: "31337", ESCROW_ADDRESS: address, ESCROW_DEPLOY_BLOCK: "0", DATABASE_URL: "postgresql://localhost/review_test", RELAYER_PRIVATE_KEY: key });
  const ctx = {
    config, now: () => new Date("2026-11-10T00:00:00Z"), log: { info() {}, warn() {}, error() {} },
    db: { $queryRaw: async () => [{ address, chainId: 31337, contractAddress: address }], claimableBalance: { update: async (data: unknown) => { updates.push(data); } } },
    rpc: { call: async () => encodeFunctionResult({ abi: ESCROW_ABI, functionName: "feeRecipient", result: address }), errorStreak: 0, lastLatencyMs: 0 },
  } as unknown as JobContext;
  let reads = 0;
  ctx.rpc.call = async () => (++reads === 1
    ? encodeFunctionResult({ abi: ESCROW_ABI, functionName: "feeRecipient", result: `0x${"22".repeat(20)}` })
    : encodeFunctionResult({ abi: ESCROW_ABI, functionName: "claimable", result: balance })) as never;
  return { ctx, updates, sent, send: async (recipient: string) => { sent.push(recipient); return `0x${"ab".repeat(32)}`; } };
}

test("does nothing without a relayer key", async () => {
  const { ctx, send, sent } = context("");
  ctx.db.$queryRaw = (() => { throw new Error("must not query"); }) as never;
  await runAutoClaim(ctx, send);
  expect(sent).toEqual([]);
});
test("does not send when the indexed balance is already claimed on chain", async () => {
  const { ctx, send, sent } = context(undefined, 0n);
  await runAutoClaim(ctx, send);
  expect(sent).toEqual([]);
});
test("records the pending transaction and retries other recipients after a failed send", async () => {
  const { ctx, updates } = context();
  ctx.db.$queryRaw = (async () => [{ address }, { address: `0x${"33".repeat(20)}` }]) as never;
  let calls = 0;
  await runAutoClaim(ctx, async () => { if (++calls === 1) throw new Error("rejected"); return "0xabc"; });
  expect(calls).toBe(2);
  expect(updates).toHaveLength(2);
  expect(updates[0]).toMatchObject({ data: { autoClaimAt: ctx.now() } });
  expect(updates[1]).toMatchObject({ data: { autoClaimTxHash: "0xabc", autoClaimAt: ctx.now() } });
});
