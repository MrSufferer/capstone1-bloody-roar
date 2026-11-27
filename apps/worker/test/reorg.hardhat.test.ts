import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pino from "pino";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { keccakUtf8 } from "@bloody-roar/shared/escrow";
import { createRpcClient } from "../src/chain/client";
import { loadConfig } from "../src/config";
import { indexerJob } from "../src/jobs/indexer";
import { fakeReorg, rpc, snapshotChain } from "../../../tests/e2e/harness/chain";
import { cleanupChain, testConfig } from "./helpers";

const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
const chainUp = await rpc("eth_chainId").then(() => true, () => false);
const emitter = `0x3333${"7f"}${keccakUtf8("OwnershipTransferred(address,address)").slice(2)}60006000a300`;
const alerts: unknown[] = [];
const hook = Bun.serve({ port: 0, fetch: async (req) => (alerts.push(await req.json()), new Response("ok")) });
const configs: { chainId: number; escrowAddress: string }[] = [];

const head = async () => BigInt(await rpc<string>("eth_blockNumber"));
const blockHash = async (n: bigint) => (await rpc<{ hash: string }>("eth_getBlockByNumber", [`0x${n.toString(16)}`, false])).hash;
const send = async (to: string, data: string) => {
  const [from] = await rpc<string[]>("eth_accounts");
  return rpc<string>("eth_sendTransaction", [{ from, to, data }]);
};

async function setup() {
  const escrowAddress = testConfig().escrowAddress;
  await rpc("hardhat_setCode", [escrowAddress, emitter]);
  const config = loadConfig({
    RPC_URL: rpcUrl,
    CHAIN_ID: "31337",
    ESCROW_ADDRESS: escrowAddress,
    ESCROW_DEPLOY_BLOCK: String(await head()),
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    FINALITY: "latest",
    INDEXER_REORG_WINDOW: "4",
    ALERT_WEBHOOK_URL: hook.url.href,
  });
  configs.push(config);
  const ctx = { db: prisma, rpc: createRpcClient({ url: rpcUrl }), config, log: pino({ level: "silent" }), now: () => new Date() };
  const where = { chainId: config.chainId, contractAddress: config.escrowAddress };
  return { ctx, where, escrowAddress, checkpoint: () => prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } }) };
}

describe.skipIf(!process.env.TEST_DATABASE_URL || !chainUp)("hardhat reorg", () => {
  beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

  afterAll(async () => {
    hook.stop(true);
    for (const config of configs) await cleanupChain(prisma, { ...testConfig(), ...config });
    await prisma.$disconnect();
  });

  test("a 2-block reorg rewinds and re-projects to match the new chain", async () => {
    const { ctx, where, escrowAddress, checkpoint } = await setup();
    const snapshot = await snapshotChain();
    const txOld = await send(escrowAddress, "0x01");
    await rpc("evm_mine");
    await indexerJob.run(ctx);
    expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: txOld } })).canonical).toBe(true);

    await fakeReorg(snapshot, 1);
    const txNew = await send(escrowAddress, "0x02");
    await rpc("evm_mine");
    const tip = await head();
    for (let i = 0; i < 5 && (await checkpoint()).lastScannedBlock < tip; i++) await indexerJob.run(ctx);

    const nodeLogs = await rpc<{ transactionHash: string; blockHash: string }[]>("eth_getLogs", [{ address: escrowAddress, fromBlock: "0x0", toBlock: "latest" }]);
    const canonical = await prisma.chainEvent.findMany({ where: { ...where, canonical: true } });
    expect(canonical.map((e) => [e.txHash, e.blockHash])).toEqual(nodeLogs.map((l) => [l.transactionHash, l.blockHash]));
    expect(canonical.map((e) => e.txHash)).toEqual([txNew]);
    expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: txOld } })).canonical).toBe(false);
    const cp = await checkpoint();
    expect(cp.lastScannedBlock).toBe(tip);
    expect(cp.lastCanonicalBlockHash).toBe(await blockHash(tip));
    expect(cp.reorgAlerted).toBe(false);
  });

  test("a reorg deeper than the window halts and alerts once", async () => {
    const { ctx, where, escrowAddress, checkpoint } = await setup();
    const snapshot = await snapshotChain();
    const txOld = await send(escrowAddress, "0x03");
    for (let i = 0; i < 6; i++) await rpc("evm_mine");
    await indexerJob.run(ctx);
    const before = await checkpoint();
    expect(before.lastScannedBlock).toBe(await head());
    const sent = alerts.length;

    await fakeReorg(snapshot, 8);
    await expect(indexerJob.run(ctx)).rejects.toThrow("REORG_BEYOND_WINDOW");
    await expect(indexerJob.run(ctx)).rejects.toThrow("REORG_BEYOND_WINDOW");

    expect(alerts.slice(sent)).toEqual([expect.objectContaining({ alerts: ["REORG_BEYOND_WINDOW"] })]);
    const after = await checkpoint();
    expect(after.lastScannedBlock).toBe(before.lastScannedBlock);
    expect(after.lastCanonicalBlockHash).toBe(before.lastCanonicalBlockHash);
    expect(after.reorgAlerted).toBe(true);
    expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: txOld } })).canonical).toBe(true);
  });
});
