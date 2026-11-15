import { ensureWorkConversation, type Prisma } from "@bloody-roar/database";
import { canReadConversation, canWriteConversation, type ChatActor } from "./chat-access";
import { gqlError } from "../graphql/errors";

export async function accessibleConversation(db: Prisma.TransactionClient, id: string, actor: ChatActor, write = false) {
  const conversation = await db.conversation.findUnique({ where: { id }, include: { issue: true, application: true, participants: true } });
  const member = conversation?.participants.some((p) => p.userId === actor.id) ?? false;
  const check = write ? canWriteConversation : canReadConversation;
  if (!conversation || !check(conversation, conversation.issue, conversation.application, actor, member)) throw gqlError("You cannot access this conversation", "FORBIDDEN");
  return conversation;
}
export async function workConversation(db: Prisma.TransactionClient, issueId: string, actor: ChatActor) {
  const issue = await db.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw gqlError("Task not found", "NOT_FOUND");
  const room = await db.conversation.findFirst({ where: { issueId, kind: "ISSUE_WORK" } });
  if (room) return accessibleConversation(db, room.id, actor);
  if (!issue.developerId || (actor.role !== "ADMIN" && issue.clientId !== actor.id && issue.developerId !== actor.id)) throw gqlError("You cannot access this task room", "FORBIDDEN");
  await db.$queryRaw`SELECT id FROM issues WHERE id = ${issueId} FOR UPDATE`;
  const created = await ensureWorkConversation(db, issue);
  return accessibleConversation(db, created.id, actor);
}
