import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectFramework, sourceContext } from "../src/jobs/source-snapshot";
import { command } from "../src/runner/command";
import { extractArchive } from "../src/runner/sandbox";

test("detects supported frameworks and caps source context", () => {
  expect(detectFramework({ "package.json": '{"devDependencies":{"vitest":"2"}}' }).framework).toBe("VITEST");
  expect(detectFramework({ "requirements.txt": "pytest" }).framework).toBe("PYTEST");
  expect(() => detectFramework({})).toThrow("Unsupported project");
  expect(sourceContext({ "checkout.ts": "x".repeat(100_000) }, "checkout failure")).toHaveLength(80_000);
});
test("rejects ZIP traversal before extracting any file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "br-zip-test-"));
  try {
    const zip = path.join(dir, "bad.zip"), destination = path.join(dir, "work"); await mkdir(destination);
    await command(["python3", "-c", 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("../escape", "secret"); z.close()', zip], dir);
    await expect(extractArchive(zip, destination)).rejects.toThrow("Unsafe archive");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("rejects actual expanded bytes even when archive headers understate them", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "br-bomb-"));
  try {
    const script = path.resolve(import.meta.dir, "../src/runner/archive.py");
    const result = await command(["python3", "-c", `import io,runpy,sys,zipfile
z=zipfile.ZipFile(sys.argv[1], 'w', compression=zipfile.ZIP_DEFLATED)
z.writestr('zeros', bytes(300 * 1024))
z.close()
original=zipfile.ZipFile.infolist
def understated(self):
 entries=original(self)
 for entry in entries: entry.file_size=1
 return entries
zipfile.ZipFile.infolist=understated
zipfile.ZipFile.open=lambda *args, **kwargs: io.BytesIO(bytes(300 * 1024))
sys.argv=[sys.argv[3],sys.argv[1],sys.argv[2],'204800']
runpy.run_path(sys.argv[0],run_name='__main__')`, path.join(dir, "bomb.zip"), path.join(dir, "work"), script], dir);
    expect(result.code).not.toBe(0);
    expect(result.log).toContain("Archive exceeds");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("source context excludes secret filenames and secret-bearing files", () => {
  const context = sourceContext({ ".env": "PRIVATE_KEY=env-secret", ".env.local": "local-secret", "cert.pem": "pem-secret", "cert.key": "key-secret", "id_rsa.pub": "rsa-secret", "config.ts": 'export const API_KEY = "config-secret";', ".env.example": "HOST=localhost", "safe.ts": "safe-source" }, "config safe cert env rsa");
  for (const secret of ["env-secret", "local-secret", "pem-secret", "key-secret", "rsa-secret", "config-secret", "config.ts", "cert.pem"]) expect(context).not.toContain(secret);
  expect(context).toContain("safe-source");
  expect(context).toContain(".env.example");
});

test("snapshot filters secrets and performs source I/O outside transactions", async () => {
  const { createHash, randomUUID } = await import("node:crypto");
  const { readFile, writeFile, readdir } = await import("node:fs/promises");
  const { sourceSnapshotJob } = await import("../src/jobs/source-snapshot");
  const dir = await mkdtemp(path.join(tmpdir(), "br-sanitize-"));
  const upload = path.resolve(import.meta.dir, "../../web/.uploads", randomUUID());
  try {
    await mkdir(upload, { recursive: true });
    const zip = path.join(upload, "source.zip");
    await command(["python3", "-c", `import sys,zipfile
with zipfile.ZipFile(sys.argv[1],'w') as z:
 for name,data in {'requirements.txt':'pytest', '.env':'PRIVATE_KEY=secret', '.env.example':'HOST=localhost', 'cert.pem':bytes(100001), 'binary.dat':b'\\x00API_KEY=hidden', 'config.py':'SECRET=hidden', 'safe.py':'value=42', 'image.bin':bytes([0,1,2]), 'large.txt':b'x'*100001, 'unicode.txt':'xin chào', 'dist/generated.js':'safe artifact'}.items(): z.writestr(name,data)
 for i in range(450): z.writestr(f'src/file{i:03}.ts', '// safe')`, zip], dir);
    const snapshot = { id: "snapshot", issueId: "issue", attachmentId: "attachment", repoUrl: null, issue: { title: "safe", description: "source" } };
    const updates: Array<Record<string, unknown>> = [];
    let inTransaction = false;
    const db = { $queryRaw: async () => [{ id: snapshot.id }], sourceSnapshot: { updateMany: async () => ({ count: 0 }), findUniqueOrThrow: async () => snapshot, update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return snapshot; } }, attachment: { findFirst: async () => { expect(inTransaction).toBe(false); return ({ fileUrl: `/api/uploads?key=${path.basename(upload)}/source.zip`, sha256: createHash("sha256").update(await readFile(zip)).digest("hex") }); } } };
    Object.assign(db, { $transaction: async (fn: (tx: typeof db) => unknown) => { inTransaction = true; try { return await fn(db); } finally { inTransaction = false; } } });
    await sourceSnapshotJob.run({ db, now: () => new Date(), config: { testRunnerEnabled: true, snapshotDir: dir } } as unknown as import("../src/runtime/scheduler").JobContext);
    expect(updates[0]).toMatchObject({ status: "PROCESSING" });
    const ready = updates.find((data) => data.status === "READY");
    expect(ready, JSON.stringify(updates)).toBeDefined();
    const extracted = path.join(dir, "extracted"); await mkdir(extracted); await extractArchive(String(ready!.storagePath), extracted);
    const tree = ready!.fileTree as Array<{ path: string; size: number }>;
    expect(Array.isArray(tree)).toBe(true);
    expect(tree).toHaveLength(457);
    expect(tree.map((file) => file.path)).toEqual(tree.map((file) => file.path).sort());
    for (const file of tree) {
      expect(file).toEqual({ path: expect.any(String), size: expect.any(Number) });
      expect((await readFile(path.join(extracted, file.path))).byteLength).toBe(file.size);
    }
    expect(tree).toContainEqual({ path: "src/file449.ts", size: 7 });
    expect(tree).toContainEqual({ path: "image.bin", size: 3 });
    expect(tree).toContainEqual({ path: "large.txt", size: 100001 });
    expect(tree).toContainEqual({ path: "unicode.txt", size: Buffer.byteLength("xin chào") });
    expect(tree).toContainEqual({ path: "dist/generated.js", size: 13 });
    for (const excluded of [".env", "cert.pem", "binary.dat", "config.py"]) {
      expect(tree.some((file) => file.path === excluded)).toBe(false);
    }
    expect(await readdir(extracted)).not.toContain(".env");
    expect(ready!.context).not.toContain("hidden");
  } finally { await rm(dir, { recursive: true, force: true }); await rm(upload, { recursive: true, force: true }); }
});

test("rejects a compressed ZIP containing 300 MB of zeros", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "br-large-zip-"));
  try {
    const zip = path.join(dir, "bomb.zip"), work = path.join(dir, "work"); await mkdir(work);
    expect((await command(["python3", "-c", 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w",compression=zipfile.ZIP_DEFLATED); z.writestr("zeros",bytes(300*1024*1024)); z.close()', zip], dir)).code).toBe(0);
    await expect(extractArchive(zip, work)).rejects.toThrow("Archive exceeds");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
