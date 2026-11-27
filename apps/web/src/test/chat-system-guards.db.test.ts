// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureWorkConversation, postSystemMessage } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { saveConversationMessage } from "../lib/chat-messages";
import { execute, loadSchema } from "./graphql-execute";

const address = () => `0x${randomBytes(20).toString("hex")}`;
describe.skipIf(!process.env.TEST_DATABASE_URL)("chat SYSTEM message guards", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client;
  let issue: Awaited<ReturnType<typeof prisma.issue.create>>;
  let tokenId = "", conversationId = "";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { symbol: "CSG", name: "Test token", address: address(), decimals: 6, chainId: 31337 } })).id;
    issue = await prisma.issue.create({ data: { title: "System guards", description: "System guard test fixture", category: "BUG_FIX", clientId: client.id, developerId: developer.id, status: "IN_PROGRESS", tokenId, bountyAmount: "100" } });
    conversationId = (await prisma.$transaction((tx) => ensureWorkConversation(tx, issue))).id;
  }, 60_000);
  afterAll(async () => {
    const ids = [client?.id, developer?.id].filter(Boolean);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    if (issue) await prisma.issue.deleteMany({ where: { id: issue.id } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  const systemId = async (clientMessageId: string) => (await prisma.message.findFirstOrThrow({ where: { conversationId, type: "SYSTEM", clientMessageId } })).id;

  it("does not let the sender edit or delete a SYSTEM message", async () => {
    await prisma.$transaction((tx) => postSystemMessage(tx, issue, client.id, "Funds released", "guard-release:sys"));
    const id = await systemId("guard-release:sys");
    const edit = await execute(`mutation($id: ID!) { editMessage(id: $id, content: "Funds refunded") { id } }`, { user: client, db: prisma }, { id });
    const remove = await execute(`mutation($id: ID!) { deleteMessage(id: $id) }`, { user: client, db: prisma }, { id });
    expect([edit.errors?.[0]?.extensions?.code, remove.errors?.[0]?.extensions?.code]).toEqual(["FORBIDDEN", "FORBIDDEN"]);
    expect(await prisma.message.findUniqueOrThrow({ where: { id } })).toMatchObject({ content: "Funds released", isDeleted: false });
  });

  it("rejects a user message id in the SYSTEM namespace so the SYSTEM line still posts", async () => {
    await expect(saveConversationMessage(prisma, developer, { conversationId, issueId: issue.id, type: "TEXT", content: "Changes requested", clientMessageId: "changes:squat:sys" })).rejects.toThrow();
    await prisma.$transaction((tx) => postSystemMessage(tx, issue, client.id, "Changes requested", "changes:squat:sys"));
    expect(await prisma.message.findMany({ where: { conversationId, clientMessageId: "changes:squat:sys" }, select: { type: true } })).toEqual([{ type: "SYSTEM" }]);
  });

  it("does not let a user reply to a SYSTEM message", async () => {
    await prisma.$transaction((tx) => postSystemMessage(tx, issue, client.id, "Escrow funded", "guard-funded:sys"));
    const replyToId = await systemId("guard-funded:sys");
    await expect(saveConversationMessage(prisma, developer, { conversationId, issueId: issue.id, type: "TEXT", content: "thanks", replyToId })).rejects.toThrow();
  });
});
