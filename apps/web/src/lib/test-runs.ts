import type { Prisma } from "@bloody-roar/database";
import { executableCases, submissionPatch, testBundleSha256 } from "@bloody-roar/shared/test-runner";
export { executableCases, submissionPatch } from "@bloody-roar/shared/test-runner";
import { gqlError } from "../graphql/errors";

export async function queueBaseCheck(tx: Prisma.TransactionClient, issueId: string) {
  if (await tx.testRun.findFirst({ where: { issueId, status: { in: ["QUEUED", "RUNNING"] } } })) throw gqlError("Tests are already running", "TEST_RUN_ACTIVE");
  const cases = await executableCases(tx, issueId, false);
  if (!cases.length) throw gqlError("No executable tests", "NO_EXECUTABLE_TESTS");
  const source = await tx.sourceSnapshot.findUnique({ where: { issueId } });
  if (source?.status !== "READY") throw gqlError("Source snapshot is not ready", "SOURCE_NOT_READY");
  return tx.testRun.create({ data: { issueId, kind: "BASE_CHECK", bundleSha256: testBundleSha256(cases) } });
}
export async function assertSubmissionTestsPassed(tx: Prisma.TransactionClient, submission: { id: string; issueId: string; developerId: string; manifest: unknown }) {
  const cases = await executableCases(tx, submission.issueId, true);
  if (!cases.length) return;
  const patch = await submissionPatch(tx, submission);
  const passed = patch?.sha256 && await tx.testRun.findFirst({ where: { submissionId: submission.id, kind: "SUBMISSION", status: "PASSED", bundleSha256: testBundleSha256(cases), patchSha256: patch.sha256 }, orderBy: { createdAt: "desc" } });
  if (!passed) throw gqlError("Run and pass the approved tests for this draft first", "TESTS_NOT_PASSED");
}
