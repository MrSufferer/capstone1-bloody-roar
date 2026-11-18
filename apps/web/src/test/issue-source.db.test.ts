// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

describe.skipIf(!process.env.TEST_DATABASE_URL)("Source inventory on the test database", () => {
  let owner: Awaited<ReturnType<typeof prisma.user.create>>;
  let issueId = "", tokenId = "";
  const tree = [{ path: "src/sum.ts", size: 42 }];
  const query = `query($id: ID!) { issueSource(issueId: $id) { status fileTree { path size } } }`;

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    owner = await prisma.user.create({ data: { walletAddress: `0x${randomBytes(20).toString("hex")}`, role: "CLIENT" } });
    tokenId = (await prisma.token.create({ data: { name: "Source test", symbol: "SRC", address: `0x${randomBytes(20).toString("hex")}`, decimals: 6, chainId: 31337 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Source inventory", description: "Check snapshot metadata", category: "BUG_FIX", status: "OPEN", clientId: owner.id, tokenId, bountyAmount: "100", requiredSkills: [] } })).id;
    await prisma.sourceSnapshot.create({ data: { issueId, status: "READY" } });
  }, 60_000);

  afterAll(async () => {
    if (issueId) await prisma.issue.deleteMany({ where: { id: issueId } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    if (owner) await prisma.user.deleteMany({ where: { id: owner.id } });
    await prisma.$disconnect();
  });

  it("defaults to SQL NULL and distinguishes it from an empty JSON inventory", async () => {
    expect(await prisma.$queryRaw`SELECT "fileTree" IS NULL AS empty FROM source_snapshots WHERE "issueId" = ${issueId}`).toEqual([{ empty: true }]);
    await prisma.sourceSnapshot.update({ where: { issueId }, data: { fileTree: [] } });
    const result = await execute(query, { user: owner, db: prisma }, { id: issueId });
    expect(result.errors).toBeUndefined();
    expect(result.data?.issueSource).toEqual({ status: "READY", fileTree: [] });
  });

  it("persists metadata and returns it only to the owner through GraphQL", async () => {
    await prisma.sourceSnapshot.update({ where: { issueId }, data: { fileTree: tree } });
    for (const user of [owner, null, { id: "other-client", role: "CLIENT" }, { id: "dev", role: "DEVELOPER" }, { id: "admin", role: "ADMIN" }]) {
      const result = await execute(query, { user, db: prisma }, { id: issueId });
      expect(result.errors).toBeUndefined();
      expect(result.data?.issueSource).toEqual({ status: "READY", fileTree: user === owner ? tree : null });
    }
  });

  it("clears the previous inventory to SQL NULL when replacing the source", async () => {
    const result = await execute(`mutation($id: ID!) { setIssueSource(issueId: $id, repoUrl: "https://github.com/example/project") { status fileTree { path size } } }`, { user: owner, db: prisma }, { id: issueId });
    expect(result.errors).toBeUndefined();
    expect(result.data?.setIssueSource).toEqual({ status: "PENDING", fileTree: null });
    expect(await prisma.$queryRaw`SELECT "fileTree" IS NULL AS empty FROM source_snapshots WHERE "issueId" = ${issueId}`).toEqual([{ empty: true }]);
  });
});
