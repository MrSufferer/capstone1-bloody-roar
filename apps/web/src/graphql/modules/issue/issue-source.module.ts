import { z } from "zod";
import { Prisma } from "@bloody-roar/database";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { lockCriteriaIssue } from "../ai/ai.module";

const SourceFileRef = builder.objectRef<{ path: string; size: number }>("SourceFile").implement({
  fields: (t) => ({ path: t.exposeString("path"), size: t.exposeInt("size") }),
});

const SourceRef = builder.prismaObject("SourceSnapshot", { fields: (t) => ({
  fileTree: t.field({
    type: [SourceFileRef], nullable: true, select: { fileTree: true },
    description: "Paths and byte sizes of sanitized snapshot files, visible only to the bounty owner",
    resolve: (source) => source.fileTree as Array<{ path: string; size: number }> | null,
  }),
  downloadUrl: t.string({ nullable: true, resolve: async (source, _args, ctx) => {
    if (!ctx.user || source.status !== "READY") return null;
    const issue = await ctx.db.issue.findUnique({ where: { id: source.issueId }, select: { clientId: true, developerId: true, status: true } });
    return issue && (issue.clientId === ctx.user.id || issue.developerId === ctx.user.id || (ctx.user.role === "ADMIN" && issue.status === "DISPUTED")) ? `/api/source-snapshots/${source.id}` : null;
  } }),
  id: t.exposeID("id"), repoUrl: t.exposeString("repoUrl", { nullable: true }), ref: t.exposeString("ref", { nullable: true }),
  commitSha: t.exposeString("commitSha", { nullable: true }), framework: t.string({ nullable: true, resolve: (s) => s.framework }),
  status: t.string({ resolve: (s) => s.status }), error: t.exposeString("error", { nullable: true }), context: t.exposeString("context", { nullable: true }),
}) });
builder.queryField("issueSource", (t) => t.prismaField({
  type: SourceRef, nullable: true, args: { issueId: t.arg.id({ required: true }) },
  resolve: async (query, _root, args, ctx) => {
    const issueId = String(args.issueId);
    const issue = await ctx.db.issue.findUnique({ where: { id: issueId }, select: { clientId: true, isDraft: true, hiddenAt: true } });
    if (!issue) return null;
    const owner = issue.clientId === ctx.user?.id;
    if (!owner && (issue.isDraft || issue.hiddenAt)) throw gqlError("Source is private", "FORBIDDEN");
    const source = await ctx.db.sourceSnapshot.findUnique({ ...query, where: { issueId } });
    if (!source || (!owner && source.status !== "READY")) return null;
    return owner ? source : { ...source, fileTree: null, context: null, error: null };
  },
}));
const inputSchema = z.object({
  repoUrl: z.string().regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).refine((s) => !s.endsWith(".git")).optional(),
  ref: z.string().trim().min(1).max(200).regex(/^[^-\s][^\s\x00]*$/).optional(), attachmentId: z.string().min(1).optional(),
}).refine((v) => Boolean(v.repoUrl) !== Boolean(v.attachmentId), "Choose either a GitHub repository or a ZIP");
builder.mutationField("setIssueSource", (t) => t.prismaField({
  type: SourceRef, args: { issueId: t.arg.id({ required: true }), repoUrl: t.arg.string(), ref: t.arg.string(), attachmentId: t.arg.id() },
  resolve: async (query, _root, args, ctx) => {
    const user = requireAuth(ctx), issueId = String(args.issueId);
    const input = parseOrThrow(inputSchema, Object.fromEntries(Object.entries({ repoUrl: args.repoUrl, ref: args.ref, attachmentId: args.attachmentId }).filter(([, v]) => v != null && v !== "")));
    return ctx.db.$transaction(async (tx) => {
      await lockCriteriaIssue(tx, issueId, user.id);
      if (input.attachmentId && !await tx.attachment.findFirst({ where: { id: input.attachmentId, issueId, uploaderId: user.id, purpose: "SOURCE", status: "ATTACHED", fileMime: "application/zip" } })) throw gqlError("Invalid source upload", "INVALID_ATTACHMENT");
      // Changing the source invalidates the red check, including already approved executable cases.
      await tx.testCase.updateMany({ where: { issueId, testCode: { not: null } }, data: { baseStatus: null, isApproved: false } });
      await tx.testCase.updateMany({ where: { issueId, isApproved: false }, data: { testCode: null, baseStatus: null } });
      await tx.testRun.updateMany({ where: { issueId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "ERROR", log: "Source changed", finishedAt: new Date() } });
      await tx.issue.update({ where: { id: issueId }, data: { termsVersion: { increment: 1 } } });
      const data = { repoUrl: input.repoUrl ?? null, ref: input.ref ?? null, attachmentId: input.attachmentId ?? null, commitSha: null, storagePath: null, sha256: null, context: null, fileTree: Prisma.DbNull, error: null, attempts: 0, framework: null, installCommand: null, status: "PENDING" as const };
      return tx.sourceSnapshot.upsert({ ...query, where: { issueId }, create: { issueId, ...data }, update: data });
    });
  },
}));
