// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureWorkConversation } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

describe.skipIf(!process.env.TEST_DATABASE_URL)("private application conversations", () => {
  const users: Array<Awaited<ReturnType<typeof prisma.user.create>>> = [];
  let issueId = "", tokenId = "";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL); await loadSchema();
    for (const role of ["CLIENT", "DEVELOPER", "DEVELOPER", "ADMIN"] as const) users.push(await prisma.user.create({ data: { walletAddress: `0x${randomBytes(20).toString("hex")}`, role } }));
    tokenId = (await prisma.token.create({ data: { name: "Conversation test", symbol: "CVT", address: `0x${randomBytes(20).toString("hex")}`, chainId: 31337, decimals: 6 } })).id;
    issueId = (await prisma.issue.create({ data: { clientId: users[0]!.id, tokenId, title: "Applicant privacy", description: "Keep each applicant's messages private", category: "BUG_FIX", bountyAmount: "100", requiredSkills: [] } })).id;
  });
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    if (issueId) await prisma.issue.delete({ where: { id: issueId } });
    if (tokenId) await prisma.token.delete({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } }); await prisma.$disconnect();
  });
  it("isolates two applicants, counts reads per person and closes writes after selection", async () => {
    const [client, a, b, admin] = users;
    const call = (query: string, user = client, variables: Record<string, unknown> = {}) => execute(query, { user, db: prisma }, variables);
    const applications = await Promise.all([a!, b!].map((u) => prisma.application.create({ data: { issueId, developerId: u.id } })));
    const open = `mutation($id: ID!) { openApplicationChat(applicationId: $id) }`;
    const roomA = (await call(open, client, { id: applications[0]!.id })).data?.openApplicationChat as string;
    const roomB = (await call(open, client, { id: applications[1]!.id })).data?.openApplicationChat as string;
    expect(roomA).toBeTruthy(); expect(roomB).not.toBe(roomA);
    expect((await call(open, b, { id: applications[0]!.id })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    const send = `mutation($id: ID!, $text: String!) { sendMessage(conversationId: $id, content: $text, clientMessageId: "dedupe") { id content } }`;
    const sent = await call(send, client, { id: roomA, text: "hello dev@example.com" });
    expect(sent.errors).toBeUndefined(); expect(sent.data?.sendMessage).toMatchObject({ content: "hello [REDACTED]" });
    const duplicate = await call(send, client, { id: roomA, text: "retry" });
    expect(duplicate.data?.sendMessage).toMatchObject({ id: (sent.data?.sendMessage as { id: string }).id });
    expect(await prisma.message.count({ where: { conversationId: roomA } })).toBe(1);
    await prisma.attachment.create({ data: { conversationId: roomA, issueId, uploaderId: client!.id, purpose: "CHAT", status: "ATTACHED", fileName: "private.txt", fileUrl: `http://localhost/api/uploads?key=${client!.id}%2Fprivate.txt`, fileSize: 5, fileMime: "text/plain" } });
    const wrongFile = await call(`mutation($id: ID!, $url: String!) { sendMessage(conversationId: $id, content: "file", type: "FILE", fileUrl: $url) { id } }`, client, { id: roomB, url: `http://localhost/api/uploads?key=${client!.id}%2Fprivate.txt` });
    expect(wrongFile.errors?.[0]?.extensions?.code).toBe("INVALID_ATTACHMENT");
    const messages = `query($id: ID!) { messages(conversationId: $id) { edges { node { id content } } } }`;
    for (const outsider of [b, admin]) expect((await call(messages, outsider, { id: roomA })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    const inbox = await call(`{ myConversations { id unreadCount canWrite } myUnreadMessageTotal }`, a);
    expect(inbox.errors).toBeUndefined(); expect(inbox.data?.myUnreadMessageTotal).toBe(1);
    expect(inbox.data?.myConversations).toEqual([expect.objectContaining({ id: roomA, unreadCount: 1, canWrite: true })]);
    const read = await call(`mutation($id: ID!) { markConversationRead(conversationId: $id) }`, a, { id: roomA });
    expect(read.errors).toBeUndefined(); expect((await call(`{ myUnreadMessageTotal }`, a)).data?.myUnreadMessageTotal).toBe(0);
    await prisma.issue.update({ where: { id: issueId }, data: { developerId: a!.id, status: "IN_PROGRESS" } });
    expect((await call(send, client, { id: roomA, text: "closed" })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await call(messages, a, { id: roomA })).errors).toBeUndefined();
    const work = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${issueId} FOR UPDATE`;
      return ensureWorkConversation(tx, { id: issueId, clientId: client!.id, developerId: a!.id });
    });
    expect((await call(send, a, { id: work.id, text: "work room" })).errors).toBeUndefined();
    await prisma.issue.update({ where: { id: issueId }, data: { status: "AWAITING_FUNDING", developerId: null } });
    expect((await call(`{ myUnreadMessageTotal }`, client)).data?.myUnreadMessageTotal).toBe(1);
    expect((await call(messages, client, { id: work.id })).errors).toBeUndefined();
    await prisma.issue.update({ where: { id: issueId }, data: { status: "IN_PROGRESS", developerId: a!.id } });
    expect((await call(messages, b, { id: work.id })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    await prisma.issue.update({ where: { id: issueId }, data: { status: "DISPUTED" } });
    expect((await call(messages, admin, { id: work.id })).errors).toBeUndefined();
    expect((await call(send, admin, { id: work.id, text: "admin writes" })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  }, 60_000);
});
