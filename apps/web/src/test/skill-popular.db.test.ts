// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

describe.skipIf(!process.env.TEST_DATABASE_URL)("popular skills on test database", () => {
  const suffix = randomBytes(8).toString("hex");
  const popular = `Zpopular${suffix}`, less = `Aless${suffix}`;
  let userId = "", tokenId = "";
  const issueIds: string[] = [];
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    userId = (await prisma.user.create({ data: { walletAddress: `0x${randomBytes(20).toString("hex")}`, role: "CLIENT" } })).id;
    tokenId = (await prisma.token.create({ data: { name: "Skill test", symbol: "SKT", address: `0x${randomBytes(20).toString("hex")}`, decimals: 6, chainId: 31337 } })).id;
    await prisma.skill.createMany({ data: [popular, less].map((name) => ({ name, slug: name.toLowerCase(), category: "test" })) });
    for (const requiredSkills of [[popular, less], [popular]]) {
      issueIds.push((await prisma.issue.create({ data: { title: "Skill test", description: "Skill test", category: "BUG_FIX", status: "OPEN", isDraft: false, bountyAmount: "100", tokenId, clientId: userId, requiredSkills } })).id);
    }
  }, 60_000);
  afterAll(async () => {
    await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
    await prisma.skill.deleteMany({ where: { name: { in: [popular, less] } } });
    await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
  it("ranks skills by the number of non-draft issues using them", async () => {
    const result = await execute("{ skills(first: 50) { name } }", { user: null, db: prisma });
    expect(result.errors).toBeUndefined();
    const names = (result.data?.skills as Array<{ name: string }>).map((skill) => skill.name);
    expect(names).toContain(popular);
    expect(names).toContain(less);
    expect(names.indexOf(popular)).toBeLessThan(names.indexOf(less));
  });
});
