import { createHash } from "node:crypto";

export type ExecutableCase = { id: string; testFilePath: string | null; testCode: string | null };
export function testBundleSha256(cases: ExecutableCase[]): string {
  return createHash("sha256").update(JSON.stringify([...cases].sort((a, b) => a.id.localeCompare(b.id)).map(({ id, testFilePath, testCode }) => ({ id, testFilePath, testCode })))).digest("hex");
}
export function safeRelativePath(value: string): boolean {
  return Boolean(value && !value.startsWith("/") && !/[\\\x00:]/.test(value) && value.split("/").every((part) => part !== ".." && part !== "." && part !== ""));
}
export function validTestPath(value: string): boolean {
  return safeRelativePath(value) && value.startsWith("__bloodyroar__/") && /(?:\.test\.[jt]sx?|\/test_[^/]+\.py)$/.test(value);
}

export async function executableCases(tx: RunnerDatabase, issueId: string, approvedOnly: boolean) {
  return tx.testCase.findMany({ where: { issueId, testCode: { not: null }, ...(approvedOnly ? { isApproved: true } : {}) }, orderBy: { id: "asc" } });
}
export async function submissionPatch(tx: RunnerDatabase, submission: { issueId: string; developerId: string; manifest: unknown }) {
  const manifest = submission.manifest as { attachments?: Array<{ key: string; sha256: string }> } | null;
  const keys = manifest?.attachments?.map((f) => f.key) ?? [];
  const files = await tx.attachment.findMany({ where: { issueId: submission.issueId, uploaderId: submission.developerId, purpose: "DELIVERY", status: "ATTACHED", fileUrl: { in: keys } } });
  return files.find((f) => /\.(patch|diff)$/i.test(f.fileName) && manifest?.attachments?.some((m) => m.key === f.fileUrl && m.sha256 === f.sha256));
}

type RunnerDatabase = {
  testCase: { findMany(args: { where: { issueId: string; testCode: { not: null }; isApproved?: boolean }; orderBy: { id: "asc" } }): Promise<ExecutableCase[]> };
  attachment: { findMany(args: { where: { issueId: string; uploaderId: string; purpose: "DELIVERY"; status: "ATTACHED"; fileUrl: { in: string[] } } }): Promise<Array<{ fileName: string; fileUrl: string; sha256: string | null }>> };
};
