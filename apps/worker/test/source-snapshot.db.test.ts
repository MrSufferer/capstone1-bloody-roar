import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { randomUUID } from "node:crypto";
import { sourceSnapshotJob } from "../src/jobs/source-snapshot";
import type { JobContext } from "../src/runtime/scheduler";

describe.skipIf(!process.env.TEST_DATABASE_URL)("snapshot worker recovery", () => {
  const wallet = randomUUID();
  let tokenId = "";
  beforeAll(async () => {
    await prisma.user.create({ data: { walletAddress: wallet } });
    tokenId = (await prisma.token.create({ data: { name: "Snapshot", symbol: "SRC", address: wallet, chainId: 31337, decimals: 6 } })).id;
  });
  afterAll(async () => {
    if (tokenId) await prisma.issue.deleteMany({ where: { tokenId } });
    await prisma.user.deleteMany({ where: { walletAddress: wallet } });
    if (tokenId) await prisma.token.delete({ where: { id: tokenId } });
    await prisma.$disconnect();
  });
  test("requeues a stale PROCESSING snapshot and leaves a fresh one running", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { walletAddress: wallet } });
    const now = new Date();
    const issue = await prisma.issue.create({ data: { title: "stale snapshot", description: "test", clientId: user.id, category: "BUG_FIX", bountyAmount: 1, tokenId } });
    const freshIssue = await prisma.issue.create({ data: { title: "fresh snapshot", description: "test", clientId: user.id, category: "BUG_FIX", bountyAmount: 1, tokenId } });
    const stale = await prisma.sourceSnapshot.create({ data: { issueId: issue.id, status: "PROCESSING", processingToken: "old-job", updatedAt: new Date(now.getTime() - 21 * 60_000) } });
    const fresh = await prisma.sourceSnapshot.create({ data: { issueId: freshIssue.id, status: "PROCESSING", processingToken: "active-job", updatedAt: now } });
    await sourceSnapshotJob.run({ db: prisma, config: { testRunnerEnabled: true }, now: () => now } as JobContext);
    expect(await prisma.sourceSnapshot.findUnique({ where: { id: stale.id } })).toMatchObject({ status: "PENDING", processingToken: null, attempts: 1 });
    expect(await prisma.sourceSnapshot.findUnique({ where: { id: fresh.id } })).toMatchObject({ status: "PROCESSING", processingToken: "active-job" });
  });
  test("fails a stale PROCESSING snapshot after two retries", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { walletAddress: wallet } });
    const issue = await prisma.issue.create({ data: { title: "exhausted snapshot", description: "test", clientId: user.id, category: "BUG_FIX", bountyAmount: 1, tokenId } });
    const now = new Date();
    const snapshot = await prisma.sourceSnapshot.create({ data: { issueId: issue.id, status: "PROCESSING", processingToken: "old-job", attempts: 2, updatedAt: new Date(now.getTime() - 21 * 60_000) } });
    await sourceSnapshotJob.run({ db: prisma, config: { testRunnerEnabled: true }, now: () => now } as JobContext);
    expect(await prisma.sourceSnapshot.findUnique({ where: { id: snapshot.id } })).toMatchObject({ status: "FAILED", processingToken: null, error: "worker lost", attempts: 2 });
  });
});
