// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";
import { sourceSnapshotJob } from "../../../worker/src/jobs/source-snapshot";
import { testRunsJob } from "../../../worker/src/jobs/test-runs";
import { command } from "../../../worker/src/runner/command";
import { loadConfig } from "../../../worker/src/config";

const { completeAI } = vi.hoisted(() => ({ completeAI: vi.fn() }));
vi.mock("../ai/model-router", async (original) => ({ ...await original<object>(), completeAI }));
vi.mock("../lib/escrow/chain-time", () => ({ readChainTime: async () => new Date() }));
const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
describe.skipIf(!process.env.TEST_DATABASE_URL || !process.env.DOCKER_TESTS)("source to verified submission in real Docker and PostgreSQL", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client;
  let issueId = "", tokenId = "", root = "", uploads = "";
  const contract = hex(20);
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL); vi.stubEnv("CHAIN_ID", "31337"); vi.stubEnv("ESCROW_ADDRESS", contract); await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { name: "Runner", symbol: "RUN", address: hex(20), chainId: 31337, decimals: 6 } })).id;
    issueId = (await prisma.issue.create({ data: { clientId: client.id, tokenId, title: "Fix addition", description: "Addition returns subtraction. Fix sum.ts.", category: "BUG_FIX", bountyAmount: "100", requiredSkills: [] } })).id;
    root = await mkdtemp(path.join(tmpdir(), "br-flow-"));
    uploads = path.resolve(process.cwd(), ".uploads", client.id); await mkdir(uploads, { recursive: true });
  });
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.transactionIntent.deleteMany({ where: { issueId } });
    await prisma.escrowProjection.deleteMany({ where: { issueId } });
    if (issueId) await prisma.issue.delete({ where: { id: issueId } });
    if (tokenId) await prisma.token.delete({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id].filter(Boolean) } } });
    for (const dir of [root, uploads, uploads ? path.resolve(process.cwd(), ".uploads", developer.id) : ""].filter(Boolean)) await rm(dir, { recursive: true, force: true });
    vi.unstubAllEnvs(); await prisma.$disconnect();
  });
  it("requires verified base tests and a passing run of the exact draft patch", async () => {
    const call = (query: string, user = client, variables: Record<string, unknown> = {}) => execute(query, { user, db: prisma }, variables);
    const zip = path.join(uploads, "source.zip");
    const fixture = { "package.json": JSON.stringify({ type: "module", devDependencies: { vitest: "2.1.9" } }), "sum.ts": "export const sum = (a: number, b: number) => a - b;\n" };
    expect((await command(["python3", "-c", 'import json,zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); [z.writestr(k,v) for k,v in json.loads(sys.argv[2]).items()]; z.close()', zip, JSON.stringify(fixture)], root)).code).toBe(0);
    const bytes = await readFile(zip), fileUrl = `http://localhost/api/uploads?key=${encodeURIComponent(`${client.id}/source.zip`)}`;
    const attachment = await prisma.attachment.create({ data: { issueId, uploaderId: client.id, purpose: "SOURCE", status: "ATTACHED", fileName: "source.zip", fileMime: "application/zip", fileSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), fileUrl } });
    const sourceMutation = `mutation($id: ID!, $file: ID!) { setIssueSource(issueId: $id, attachmentId: $file) { status } }`;
    expect((await call(sourceMutation, developer, { id: issueId, file: attachment.id })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await call(sourceMutation, client, { id: issueId, file: attachment.id })).errors).toBeUndefined();
    await prisma.sourceSnapshot.update({ where: { issueId }, data: { attempts: 2, status: "FAILED", error: "worker lost" } });
    expect((await call(sourceMutation, client, { id: issueId, file: attachment.id })).errors).toBeUndefined();
    expect((await prisma.sourceSnapshot.findUniqueOrThrow({ where: { issueId } })).attempts).toBe(0);
    const config = loadConfig({ RPC_URL: "http://localhost:8545", CHAIN_ID: "31337", ESCROW_ADDRESS: contract, ESCROW_DEPLOY_BLOCK: "0", DATABASE_URL: process.env.TEST_DATABASE_URL!, TEST_RUNNER_ENABLED: "true", SNAPSHOT_DIR: root });
    const ctx = { db: prisma, config, rpc: {} as never, log: { info() {}, warn() {}, error() {} }, now: () => new Date() };
    await sourceSnapshotJob.run(ctx);
    const source = await prisma.sourceSnapshot.findUniqueOrThrow({ where: { issueId } });
    expect(source.status, source.error ?? "").toBe("READY");
    completeAI.mockResolvedValueOnce({ text: JSON.stringify({ testCases: [
      { name: "bug", expression: "sum(2,3)", expected: "5", expectBaseFail: true },
      { name: "zero", expression: "sum(0,0)", expected: "0", expectBaseFail: false },
      { name: "export", expression: "typeof sum", expected: '\"function\"', expectBaseFail: false },
    ].map((c) => ({ title: `Check ${c.name}`, description: "Verify addition behavior", given: "a sum function", when: "adding two numbers", then: "the result is correct", priority: "NORMAL", expectBaseFail: c.expectBaseFail, testFilePath: `__bloodyroar__/${c.name}.test.ts`, testCode: `import {test,expect} from "vitest"; import {sum} from "../sum"; test("[TC:{{ID}}] ${c.name}",()=>expect(${c.expression}).toBe(${c.expected}));` })) }) });
    expect((await call(`mutation($id: String!) { generateTestCases(issueId: $id) { id } }`, client, { id: issueId })).errors).toBeUndefined();
    expect(completeAI.mock.calls[0]?.[0].messages[1].content).toContain("sum.ts");
    const cases = await prisma.testCase.findMany({ where: { issueId } });
    expect(cases.every((c) => c.testCode?.includes(`[TC:${c.id}]`))).toBe(true);
    const approve = `mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id } }`;
    expect((await call(approve, client, { input: { id: cases[0]!.id, isApproved: true } })).errors?.[0]?.extensions?.code).toBe("TEST_NOT_VERIFIED");
    await testRunsJob.run(ctx);
    for (const c of cases) expect((await call(approve, client, { input: { id: c.id, isApproved: true } })).errors).toBeUndefined();
    await prisma.issue.update({ where: { id: issueId }, data: { developerId: developer.id, status: "IN_PROGRESS" } });
    const deadline = new Date(Date.now() + 86_400_000);
    await prisma.escrowProjection.create({ data: { issueId, escrowKey: `runner-${issueId}`, escrowIdHash: hex(32), chainId: 31337, contractAddress: contract, client: client.walletAddress, developer: developer.walletAddress, arbiter: hex(20), feeRecipient: hex(20), amountRaw: "100000000", depositedAt: new Date(), deliveryDeadline: deadline, reviewDeadline: deadline, termsHash: hex(32), phase: "FUNDED", lastProjectedBlock: 1n } });
    const devUploads = path.resolve(process.cwd(), ".uploads", developer.id); await mkdir(devUploads, { recursive: true });
    const patch = 'diff --git a/sum.ts b/sum.ts\n--- a/sum.ts\n+++ b/sum.ts\n@@ -1 +1 @@\n-export const sum = (a: number, b: number) => a - b;\n+export const sum = (a: number, b: number) => a + b;\n';
    await writeFile(path.join(devUploads, "fix.patch"), patch);
    const delivery = await prisma.attachment.create({ data: { issueId, uploaderId: developer.id, purpose: "DELIVERY", status: "ATTACHED", fileName: "fix.patch", fileMime: "text/x-diff", fileSize: Buffer.byteLength(patch), sha256: createHash("sha256").update(patch).digest("hex"), fileUrl: `http://localhost/api/uploads?key=${encodeURIComponent(`${developer.id}/fix.patch`)}` } });
    const draftResult = await call(`mutation($issue: ID!, $files: [ID!]) { createSubmissionDraft(issueId: $issue, attachmentIds: $files) { id } }`, developer, { issue: issueId, files: [delivery.id] });
    expect(draftResult.errors).toBeUndefined(); const draft = (draftResult.data?.createSubmissionDraft as { id: string }).id;
    const prepare = `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId } }`;
    expect((await call(prepare, developer, { id: draft })).errors?.[0]?.extensions?.code).toBe("TESTS_NOT_PASSED");
    expect((await call(`mutation($id: ID!) { runSubmissionTests(submissionId: $id) { id } }`, developer, { id: draft })).errors).toBeUndefined();
    await testRunsJob.run(ctx);
    const passed = await prisma.testRun.findFirstOrThrow({ where: { submissionId: draft } });
    expect(passed.status, passed.log ?? "").toBe("PASSED");
    expect((await call(prepare, developer, { id: draft })).errors).toBeUndefined();
    await prisma.testRun.update({ where: { id: passed.id }, data: { status: "FAILED" } });
    expect((await call(prepare, developer, { id: draft })).errors?.[0]?.extensions?.code).toBe("TESTS_NOT_PASSED");
    await prisma.testRun.update({ where: { id: passed.id }, data: { status: "PASSED", bundleSha256: "stale" } });
    expect((await call(prepare, developer, { id: draft })).errors?.[0]?.extensions?.code).toBe("TESTS_NOT_PASSED");
    await prisma.testRun.update({ where: { id: passed.id }, data: { bundleSha256: passed.bundleSha256, patchSha256: "stale" } });
    expect((await call(prepare, developer, { id: draft })).errors?.[0]?.extensions?.code).toBe("TESTS_NOT_PASSED");
  }, 180_000);
});
