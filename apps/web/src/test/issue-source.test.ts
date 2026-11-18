import { beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@bloody-roar/database";
import { execute, loadSchema } from "./graphql-execute";

beforeAll(loadSchema, 60_000);
const owner = { id: "owner", role: "CLIENT", isBanned: false };
const tree = [{ path: "src/sum.ts", size: 42 }];
const query = `query { issueSource(issueId: "issue") { status fileTree { path size } } }`;
function database(fileTree: unknown = tree) {
  const issue = { id: "issue", clientId: owner.id, developerId: "dev", isDraft: false, hiddenAt: null, status: "OPEN" };
  const source = { id: "snapshot", issueId: issue.id, status: "READY", fileTree };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    issue: { findUnique: vi.fn(async () => issue), update: vi.fn().mockResolvedValue(issue) },
    sourceSnapshot: { findUnique: vi.fn(async () => source), upsert: vi.fn(async () => ({ ...source, status: "PENDING", fileTree: null })) },
    fundingReservation: { findFirst: vi.fn().mockResolvedValue(null) },
    testCase: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    testRun: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return { ...tx, tx, $transaction: vi.fn(async (fn: (transaction: typeof tx) => unknown) => fn(tx)) };
}

describe("snapshot file tree", () => {
  it("returns paths and byte sizes to the bounty owner", async () => {
    const result = await execute(query, { user: owner, db: database() });
    expect(result.errors).toBeUndefined();
    expect(result.data?.issueSource).toEqual({ status: "READY", fileTree: tree });
  });

  it.each([null, { id: "other-client", role: "CLIENT" }, { id: "dev", role: "DEVELOPER" }, { id: "admin", role: "ADMIN" }])("does not expose the tree to a non-owner (%j)", async (user) => {
    const result = await execute(query, { user, db: database() });
    expect(result.errors).toBeUndefined();
    expect(result.data?.issueSource).toEqual({ status: "READY", fileTree: null });
  });

  it("keeps old snapshots without an inventory distinct from an empty inventory", async () => {
    for (const value of [null, []]) {
      const result = await execute(query, { user: owner, db: database(value) });
      expect(result.errors).toBeUndefined();
      expect(result.data?.issueSource).toMatchObject({ fileTree: value });
    }
  });

  it("clears the old tree in the same transaction that replaces the source", async () => {
    const db = database();
    const mutation = `mutation { setIssueSource(issueId: "issue", repoUrl: "https://github.com/example/project") { status fileTree { path size } } }`;
    const result = await execute(mutation, { user: owner, db });
    expect(result.errors).toBeUndefined();
    expect(result.data?.setIssueSource).toEqual({ status: "PENDING", fileTree: null });
    expect(db.tx.sourceSnapshot.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ fileTree: Prisma.DbNull }),
      update: expect.objectContaining({ fileTree: Prisma.DbNull }),
    }));
  });
});
