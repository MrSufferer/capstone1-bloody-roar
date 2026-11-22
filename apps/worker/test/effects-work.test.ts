import { expect, test } from "bun:test";
import type { Prisma } from "@bloody-roar/database";
import { applyWorkSubmitted } from "../src/effects/work";
import type { EffectMeta } from "../src/effects/escrow";

const hash = (value: string) => `0x${value.repeat(64)}` as `0x${string}`;

test("an old superseded hash can be submitted before the newer draft", async () => {
  const oldHash = hash("a"), newHash = hash("b");
  const rows = [
    { id: "old", issueId: "issue", deliveryHash: oldHash, status: "SUPERSEDED", supersededAt: new Date(1), onChainEventId: null as string | null },
    { id: "new", issueId: "issue", deliveryHash: newHash, status: "DRAFT", supersededAt: null as Date | null, onChainEventId: null as string | null },
    { id: "previous", issueId: "issue", deliveryHash: hash("c"), status: "SUBMITTED", supersededAt: null as Date | null, onChainEventId: "previous-event" },
  ];
  const tx = {
    escrowProjection: {
      findUnique: async () => ({ id: "projection", issueId: "issue", escrowKey: "escrow" }),
      update: async () => ({}),
    },
    issue: { findUniqueOrThrow: async () => ({ clientId: "client", title: "Bounty" }) },
    submission: {
      findFirst: async ({ where }: { where: { issueId: string; status?: string; deliveryHash: { equals: string } } }) =>
        rows.find((row) => row.issueId === where.issueId && row.deliveryHash.toLowerCase() === where.deliveryHash.equals.toLowerCase() && (!where.status || row.status === where.status)) ?? null,
      updateMany: async ({ where, data }: { where: { issueId: string; status: string; id?: { not: string } }; data: Record<string, unknown> }) => {
        const matches = rows.filter((row) => row.issueId === where.issueId && row.status === where.status && row.id !== where.id?.not);
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.find((row) => row.id === where.id)!, data),
    },
    transactionIntent: { updateMany: async () => ({ count: 1 }) },
    notification: { createMany: async () => ({ count: 0 }) },
  };
  const meta: EffectMeta = { chainId: 31337, contractAddress: hash("1"), chainEventId: "old-event", escrowIdHash: hash("2"),
    blockNumber: 1n, blockHash: hash("3"), txHash: hash("4"), txIndex: 0, logIndex: 0, blockTimestamp: 1_900_000_000n };
  const effect = { kind: "WORK_SUBMITTED" as const, escrowIdHash: meta.escrowIdHash, developer: hash("5"), deliveryHash: oldHash.toUpperCase() as `0x${string}` };
  await applyWorkSubmitted(tx as unknown as Prisma.TransactionClient, effect, meta);
  expect(rows[0]).toMatchObject({ status: "SUBMITTED", supersededAt: null, deliveryHash: oldHash, onChainEventId: "old-event" });
  expect(rows[1]).toMatchObject({ status: "DRAFT", supersededAt: null });
  expect(rows[2]).toMatchObject({ status: "SUPERSEDED", supersededAt: new Date(Number(meta.blockTimestamp) * 1000) });

  await applyWorkSubmitted(tx as unknown as Prisma.TransactionClient, { ...effect, deliveryHash: newHash }, { ...meta, chainEventId: "new-event", blockTimestamp: meta.blockTimestamp + 1n });
  expect(rows[0]).toMatchObject({ status: "SUPERSEDED", deliveryHash: oldHash, supersededAt: new Date(Number(meta.blockTimestamp + 1n) * 1000) });
  expect(rows[1]).toMatchObject({ status: "SUBMITTED", supersededAt: null, onChainEventId: "new-event" });
});
