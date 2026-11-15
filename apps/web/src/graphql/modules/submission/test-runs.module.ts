import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError } from "../../errors";
import { executableCases, queueBaseCheck, submissionPatch } from "../../../lib/test-runs";
import { testBundleSha256 } from "@bloody-roar/shared/test-runner";
import { lockCriteriaIssue } from "../ai/ai.module";

export const TestRunRef = builder.prismaObject("TestRun", { fields: (t) => ({
  id: t.exposeID("id"), submissionId: t.exposeString("submissionId", { nullable: true }), kind: t.string({ resolve: (r) => r.kind }), status: t.string({ resolve: (r) => r.status }),
  results: t.string({ nullable: true, resolve: (r) => r.results == null ? null : JSON.stringify(r.results) }), log: t.exposeString("log", { nullable: true }),
  createdAt: t.field({ type: "DateTime", resolve: (r) => r.createdAt }), finishedAt: t.field({ type: "DateTime", nullable: true, resolve: (r) => r.finishedAt }),
}) });
builder.queryField("testRuns", (t) => t.prismaField({
  type: [TestRunRef], args: { issueId: t.arg.id({ required: true }), submissionId: t.arg.id() },
  resolve: async (query, _root, args, ctx) => {
    const user = requireAuth(ctx), issueId = String(args.issueId);
    const issue = await ctx.db.issue.findUnique({ where: { id: issueId }, select: { clientId: true, developerId: true } });
    if (!issue || (user.role !== "ADMIN" && issue.clientId !== user.id && issue.developerId !== user.id)) throw gqlError("Tests are private to task participants", "FORBIDDEN");
    return ctx.db.testRun.findMany({ ...query, where: { issueId, ...(args.submissionId ? { submissionId: String(args.submissionId) } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 });
  },
}));
builder.mutationField("rerunBaseCheck", (t) => t.prismaField({
  type: TestRunRef, args: { issueId: t.arg.id({ required: true }) },
  resolve: async (_query, _root, args, ctx) => {
    const user = requireAuth(ctx), issueId = String(args.issueId);
    return ctx.db.$transaction(async (tx) => { await lockCriteriaIssue(tx, issueId, user.id); return queueBaseCheck(tx, issueId); });
  },
}));
builder.mutationField("runSubmissionTests", (t) => t.prismaField({
  type: TestRunRef, args: { submissionId: t.arg.id({ required: true }) },
  resolve: async (_query, _root, args, ctx) => {
    const user = requireAuth(ctx), id = String(args.submissionId);
    return ctx.db.$transaction(async (tx) => {
      const initial = await tx.submission.findUnique({ where: { id } });
      if (!initial || initial.developerId !== user.id) throw gqlError("Draft not found", "NOT_FOUND");
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${initial.issueId} FOR UPDATE`;
      const submission = await tx.submission.findUniqueOrThrow({ where: { id }, include: { issue: true } });
      if (submission.status !== "DRAFT" || submission.issue.developerId !== user.id || submission.issue.status !== "IN_PROGRESS") throw gqlError("Only the assigned developer's draft can run", "SUBMISSION_NOT_DRAFT");
      const source = await tx.sourceSnapshot.findUnique({ where: { issueId: submission.issueId } });
      if (source?.status !== "READY") throw gqlError("Source is not ready", "SOURCE_NOT_READY");
      const active = await tx.testRun.findFirst({ where: { issueId: submission.issueId, status: { in: ["QUEUED", "RUNNING"] } } });
      if (active) throw gqlError("Tests are already running", "TEST_RUN_ACTIVE");
      if (await tx.testRun.count({ where: { issueId: submission.issueId, kind: "SUBMISSION", createdAt: { gte: new Date(Date.now() - 86_400_000) } } }) >= 20) throw gqlError("Daily test limit reached", "RATE_LIMITED");
      const cases = await executableCases(tx, submission.issueId, true), patch = await submissionPatch(tx, submission);
      if (!cases.length) throw gqlError("No executable tests", "NO_EXECUTABLE_TESTS");
      if (!patch?.sha256) throw gqlError("Attach a .patch or .diff delivery file", "NO_PATCH_FILE");
      return tx.testRun.create({ data: { issueId: submission.issueId, submissionId: id, kind: "SUBMISSION", bundleSha256: testBundleSha256(cases), patchSha256: patch.sha256 } });
    });
  },
}));
