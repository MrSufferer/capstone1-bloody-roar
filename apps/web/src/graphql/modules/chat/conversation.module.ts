import { saveConversationMessage, enforceMessageRate } from "../../../lib/chat-messages";
import { broadcastConversationMessage, getSocketIO } from "../../../socket/handlers";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError } from "../../errors";
import { accessibleConversation, workConversation } from "../../../lib/conversations";
import { canReadConversation, canWriteConversation } from "../../../lib/chat-access";
import { UserRef } from "../user/user.module";
import { IssueRef, ISSUE_INCLUDE } from "../issue/issue.module";
import { MessageRef } from "./chat.module";
import type { Prisma } from "@bloody-roar/database";

const include = { issue: { include: ISSUE_INCLUDE }, application: true, participants: { include: { user: true } }, messages: { where: { isDeleted: false }, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 1, include: { sender: true, attachments: true } } } satisfies Prisma.ConversationInclude;
type InboxRow = Prisma.ConversationGetPayload<{ include: typeof include }> & { unreadCount: number; canWrite: boolean };
const ConversationRef = builder.objectRef<InboxRow>("Conversation").implement({ fields: (t) => ({
  id: t.exposeID("id"), kind: t.exposeString("kind"), issueId: t.exposeString("issueId"),
  issue: t.field({ type: IssueRef, resolve: (row) => row.issue }),
  counterpart: t.field({ type: UserRef, nullable: true, resolve: (row, _args, ctx) => row.participants.find((p) => p.userId !== ctx.user?.id && p.role !== "ADMIN")?.user ?? null }),
  lastMessageAt: t.field({ type: "DateTime", nullable: true, resolve: (row) => row.lastMessageAt }),
  lastMessage: t.field({ type: MessageRef, nullable: true, resolve: (row) => row.messages[0] ?? null }),
  unreadCount: t.exposeInt("unreadCount"), canWrite: t.exposeBoolean("canWrite"),
}) });
builder.queryField("myConversations", (t) => t.field({
  type: [ConversationRef], args: { first: t.arg.int(), after: t.arg.id() },
  resolve: async (_root, args, ctx) => {
    const user = requireAuth(ctx), first = args.first ?? 30;
    if (first < 1 || first > 50) throw gqlError("first must be between 1 and 50", "BAD_USER_INPUT");
    if (args.after && !await ctx.db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: String(args.after), userId: user.id } } })) throw gqlError("Invalid cursor", "INVALID_CURSOR");
    const rows = await ctx.db.conversation.findMany({ where: { participants: { some: { userId: user.id } } }, include, orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }], take: first, ...(args.after ? { cursor: { id: String(args.after) }, skip: 1 } : {}) });
    const visible = rows.filter((row) => canReadConversation(row, row.issue, row.application, user, true));
    const counts = visible.length ? await ctx.db.message.groupBy({ by: ["conversationId"], where: { isDeleted: false, senderId: { not: user.id }, OR: visible.map((row) => { const lastReadAt = row.participants.find((p) => p.userId === user.id)?.lastReadAt; return { conversationId: row.id, ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}) }; }) }, _count: { _all: true } }) : [];
    const byId = new Map(counts.map((row) => [row.conversationId, row._count._all]));
    return visible.map((row) => ({ ...row, unreadCount: byId.get(row.id) ?? 0, canWrite: canWriteConversation(row, row.issue, row.application, user, true) }));
  },
}));
builder.mutationField("workConversation", (t) => t.string({
  nullable: true, args: { issueId: t.arg.id({ required: true }) },
  resolve: async (_root, args, ctx) => { const user = requireAuth(ctx); return (await ctx.db.$transaction((tx) => workConversation(tx, String(args.issueId), user))).id; },
}));
builder.mutationField("openApplicationChat", (t) => t.string({
  args: { applicationId: t.arg.id({ required: true }) },
  resolve: async (_root, args, ctx) => {
    const user = requireAuth(ctx), applicationId = String(args.applicationId);
    return ctx.db.$transaction(async (tx) => {
      const initial = await tx.application.findUnique({ where: { id: applicationId } });
      if (!initial) throw gqlError("Application not found", "NOT_FOUND");
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${initial.issueId} FOR UPDATE`;
      const application = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, include: { issue: true } });
      if (user.role === "ADMIN" || (user.id !== application.developerId && user.id !== application.issue.clientId)) throw gqlError("You cannot access this application", "FORBIDDEN");
      const room = await tx.conversation.upsert({ where: { applicationId }, update: {}, create: { kind: "APPLICATION", issueId: application.issueId, applicationId, participants: { create: [{ userId: application.issue.clientId, role: "CLIENT" }, { userId: application.developerId, role: "APPLICANT" }] } } });
      return room.id;
    });
  },
}));
builder.mutationField("markConversationRead", (t) => t.boolean({
  args: { conversationId: t.arg.id({ required: true }), throughMessageId: t.arg.id() },
  resolve: async (_root, args, ctx) => {
    const user = requireAuth(ctx), id = String(args.conversationId);
    const result = await ctx.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id} FOR UPDATE`;
      const room = await accessibleConversation(tx, id, user);
      if (!room.participants.some((p) => p.userId === user.id)) return true;
      const through = await tx.message.findFirst({ where: { ...(args.throughMessageId ? { id: String(args.throughMessageId) } : {}), conversationId: id, isDeleted: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (args.throughMessageId && !through) throw gqlError("Invalid read marker", "BAD_USER_INPUT");
      if (!through) return true;
      const at = through.createdAt;
      await tx.conversationParticipant.updateMany({ where: { conversationId: id, userId: user.id, OR: [{ lastReadAt: null }, { lastReadAt: { lt: at } }] }, data: { lastReadAt: at } });
      return true;
    });
    try { getSocketIO().to(`user:${user.id}`).emit("inbox:update", { conversationId: id, lastMessageAt: new Date().toISOString(), unreadDelta: 0 }); } catch { /* HTTP-only tests have no socket server. */ }
    return result;
  },
}));
builder.queryField("myUnreadMessageTotal", (t) => t.int({
  resolve: async (_root, _args, ctx) => {
    const user = requireAuth(ctx);
    const rows = await ctx.db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM messages m
      JOIN conversation_participants p ON p."conversationId" = m."conversationId"
      JOIN conversations c ON c.id = p."conversationId" JOIN issues i ON i.id = c."issueId"
      WHERE p."userId" = ${user.id} AND m."senderId" <> ${user.id} AND NOT m."isDeleted"
      AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
      AND (c.kind = 'APPLICATION' OR (i.status IN ('AWAITING_FUNDING','IN_PROGRESS','DISPUTED','COMPLETED','CANCELLED') AND
        ((i."developerId" IS NOT NULL AND (i."clientId" = ${user.id} OR i."developerId" = ${user.id})) OR
         (i.status = 'AWAITING_FUNDING' AND i."developerId" IS NULL AND EXISTS
           (SELECT 1 FROM conversation_participants d WHERE d."conversationId" = c.id AND d.role = 'DEVELOPER')
           AND (i."clientId" = ${user.id} OR p.role = 'DEVELOPER')))))`;
    return Math.min(Number(rows[0]?.count ?? 0), 2147483647);
  },
}));


builder.mutationField("sendMessage", (t) => t.field({
  type: MessageRef,
  args: { conversationId: t.arg.id({ required: true }), content: t.arg.string({ required: true }), type: t.arg.string(), replyToId: t.arg.id(), clientMessageId: t.arg.string(), fileUrl: t.arg.string() },
  resolve: async (_root, args, ctx) => {
    const user = requireAuth(ctx); enforceMessageRate(user.id);
    const room = await accessibleConversation(ctx.db, String(args.conversationId), user, true);
    const data = Object.fromEntries(Object.entries(args).filter(([, v]) => v != null));
    const result = await saveConversationMessage(ctx.db, user, { ...data, issueId: room.issueId });
    try { await broadcastConversationMessage(getSocketIO(), result); } catch { /* HTTP-only deployments still persist messages. */ }
    return result.message;
  },
}));
