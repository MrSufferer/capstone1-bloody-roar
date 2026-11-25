// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "socket.io";
import { prisma, ensureWorkConversation } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { saveConversationMessage } from "../lib/chat-messages";
import { broadcastConversationMessage } from "../socket/handlers";

const address = () => `0x${randomBytes(20).toString("hex")}`;
describe.skipIf(!process.env.TEST_DATABASE_URL)("conversation broadcast access", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client, rejected: typeof client;
  let issueId = "", tokenId = "", conversationId = "";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    rejected = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { symbol: "BCA", name: "Test token", address: address(), decimals: 6, chainId: 31337 } })).id;
    const issue = await prisma.issue.create({ data: { title: "Broadcast access", description: "Broadcast access test fixture", category: "BUG_FIX", clientId: client.id, developerId: rejected.id, status: "IN_PROGRESS", tokenId, bountyAmount: "100" } });
    issueId = issue.id;
    conversationId = (await prisma.$transaction((tx) => ensureWorkConversation(tx, issue))).id;
    const replaced = await prisma.issue.update({ where: { id: issueId }, data: { developerId: developer.id } });
    await prisma.$transaction((tx) => ensureWorkConversation(tx, replaced));
  }, 60_000);
  afterAll(async () => {
    const ids = [client?.id, developer?.id, rejected?.id].filter(Boolean);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    if (issueId) await prisma.issue.deleteMany({ where: { id: issueId } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  it("stops sending new messages to a developer who lost access, and keeps both members", async () => {
    const room = `conv:${conversationId}`;
    const sockets = [client, developer, rejected].map((user) => ({ data: { user }, rooms: new Set([room]), received: [] as string[], leave(name: string) { this.rooms.delete(name); } }));
    const io = {
      in: (name: string) => ({ fetchSockets: async () => sockets.filter((s) => s.rooms.has(name)) }),
      to: (name: string) => ({ emit: (event: string) => { for (const s of sockets.filter((s) => s.rooms.has(name))) s.received.push(event); } }),
    };
    const result = await saveConversationMessage(prisma, client, { conversationId, issueId, type: "TEXT", content: "terms update" });
    await broadcastConversationMessage(io as unknown as Server, result);
    expect(sockets.map((s) => s.received.includes("message:new"))).toEqual([true, true, false]);
    expect(sockets[2]?.rooms.has(room)).toBe(false);
  });
});
