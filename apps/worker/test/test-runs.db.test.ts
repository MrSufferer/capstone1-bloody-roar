import { afterAll, describe, expect, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { randomUUID } from "node:crypto";
import { testRunsJob } from "../src/jobs/test-runs";
import type { JobContext } from "../src/runtime/scheduler";

describe.skipIf(!process.env.TEST_DATABASE_URL)("lost worker", () => {
  const wallet = randomUUID();
  let tokenId = "";
  afterAll(async () => { await prisma.issue.deleteMany({ where: { tokenId } }); await prisma.user.deleteMany({ where: { walletAddress: wallet } }); if (tokenId) await prisma.token.delete({ where: { id: tokenId } }); await prisma.$disconnect(); });
  test("expires stale RUNNING tests and unblocks TEST_RUN_ACTIVE", async () => {
    const user = await prisma.user.create({ data: { walletAddress: wallet } });
    tokenId = (await prisma.token.create({ data: { name: "Runner", symbol: "RUN", address: wallet, chainId: 31337, decimals: 6 } })).id;
    const issue = await prisma.issue.create({ data: { title: "lost worker", description: "test", clientId: user.id, category: "BUG_FIX", bountyAmount: 1, tokenId } });
    const now = new Date();
    const stale = await prisma.testRun.create({ data: { issueId: issue.id, kind: "BASE_CHECK", bundleSha256: "test", status: "RUNNING", startedAt: new Date(now.getTime() - 21 * 60_000) } });
    const otherIssue = await prisma.issue.create({ data: { title: "fresh", description: "test", clientId: user.id, category: "BUG_FIX", bountyAmount: 1, tokenId } });
    const fresh = await prisma.testRun.create({ data: { issueId: otherIssue.id, kind: "BASE_CHECK", bundleSha256: "test", status: "RUNNING", startedAt: now } });
    await testRunsJob.run({ db: prisma, config: { testRunnerEnabled: true }, now: () => now } as JobContext);
    expect(await prisma.testRun.findUnique({ where: { id: stale.id } })).toMatchObject({ status: "ERROR", log: "worker lost", finishedAt: now });
    expect(await prisma.testRun.findUnique({ where: { id: fresh.id } })).toMatchObject({ status: "RUNNING" });
    await prisma.testRun.delete({ where: { id: fresh.id } });
    expect(await prisma.testRun.findFirst({ where: { issueId: issue.id, status: { in: ["QUEUED", "RUNNING"] } } })).toBeNull();
  });
});
