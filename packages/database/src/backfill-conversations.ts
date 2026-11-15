import { fileURLToPath } from "node:url";
import path from "node:path";
import { prisma } from "./index";
import { ensureWorkConversation } from "./conversations";

export async function backfillConversations() {
  const issues = await prisma.issue.findMany({ where: { messages: { some: {} } }, select: { id: true, clientId: true, developerId: true } });
  let updated = 0;
  for (const issue of issues) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${issue.id} FOR UPDATE`;
      const conversation = issue.developerId ? await ensureWorkConversation(tx, issue) :
        await tx.conversation.findFirst({ where: { issueId: issue.id, kind: "ISSUE_WORK" } }) ?? await tx.conversation.create({ data: { issueId: issue.id, kind: "ISSUE_WORK", participants: { create: { userId: issue.clientId, role: "CLIENT" } } } });
      for (const userId of [issue.clientId, issue.developerId].filter((id): id is string => Boolean(id))) {
        const columns = await tx.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'messages' AND column_name = 'readAt') AS exists`;
        if (columns[0]?.exists) {
          const read = await tx.$queryRawUnsafe<Array<{ at: Date | null }>>('SELECT max("readAt") AS at FROM messages WHERE "issueId" = $1 AND "senderId" <> $2', issue.id, userId);
          await tx.conversationParticipant.updateMany({ where: { conversationId: conversation.id, userId, lastReadAt: null }, data: { lastReadAt: read[0]?.at ?? null } });
        }
      }
      updated += await tx.$executeRaw`UPDATE messages SET "conversationId" = ${conversation.id} WHERE "issueId" = ${issue.id} AND "conversationId" IS NULL`;
      const latest = await tx.message.aggregate({ where: { conversationId: conversation.id }, _max: { createdAt: true } });
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: latest._max.createdAt } });
    });
  }
  return updated;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Backfilled ${await backfillConversations()} messages`); }
  finally { await prisma.$disconnect(); }
}
