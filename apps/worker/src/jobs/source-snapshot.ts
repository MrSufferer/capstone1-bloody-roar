import { sensitiveSourceFile } from "@bloody-roar/shared/source-privacy";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { command } from "../runner/command";
import { extractArchive } from "../runner/sandbox";
import { readAttachment } from "../storage";
import type { Job } from "../runtime/scheduler";

export function detectFramework(files: Record<string, string>) {
  if (files["package.json"] && /"vitest"\s*:/.test(files["package.json"])) return { framework: "VITEST" as const, installCommand: "bun install --ignore-scripts" };
  if (files["requirements.txt"] !== undefined) return { framework: "PYTEST" as const, installCommand: "pip install --only-binary=:all: -r requirements.txt pytest" };
  if (files["pyproject.toml"] !== undefined) return { framework: "PYTEST" as const, installCommand: "pip install --only-binary=:all: project.dependencies pytest" };
  throw new Error("Unsupported project: need vitest or pytest");
}
export function sourceContext(files: Record<string, string>, description: string): string {
  const keys = Object.keys(files).filter((key) => !sensitiveSourceFile(key, files[key])).sort(), words = description.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? [];
  const relevant = keys.filter((key) => /(?:^|\/)(package.json|pyproject.toml|requirements.txt)$/.test(key) || words.some((word) => key.toLowerCase().includes(word)));
  let context = keys.slice(0, 400).join("\n").slice(0, 80_000);
  for (const key of relevant) {
    if (context.length >= 80_000) break;
    context += (`\n\n--- ${key} ---\n${files[key]}`).slice(0, 80_000 - context.length);
  }
  return context;
}
async function textFiles(root: string, relative = "", files: Record<string, string> = {}, collect = true) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const key = path.posix.join(relative, entry.name);
    if (sensitiveSourceFile(key)) { await rm(path.join(root, key), { recursive: true, force: true }); continue; }
    if (entry.isDirectory()) await textFiles(root, key, files, collect && ![".git", "node_modules", "dist", ".venv", "__pycache__"].includes(entry.name));
    else if (entry.isFile()) {
      const data = await readFile(path.join(root, key));
      if (sensitiveSourceFile(key, data.toString("utf8"))) { await rm(path.join(root, key)); continue; }
      if (collect && data.length <= 100_000 && !data.includes(0)) files[key] = data.toString("utf8");
    }
  }
  return files;
}
export const sourceSnapshotJob: Job = {
  name: "source-snapshot", everyMs: 10_000,
  async run({ db, config, now }) {
    if (!config.testRunnerEnabled) return;
    const stale = { status: "PROCESSING" as const, updatedAt: { lt: new Date(now().getTime() - 20 * 60_000) } };
    const failed = await db.sourceSnapshot.updateMany({ where: { ...stale, attempts: { gte: 2 } }, data: { status: "FAILED", error: "worker lost" } });
    const recovered = await db.sourceSnapshot.updateMany({ where: { ...stale, attempts: { lt: 2 } }, data: { status: "PENDING", attempts: { increment: 1 } } });
    if (failed.count || recovered.count) return;
    const snapshot = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM source_snapshots WHERE status = 'PENDING' ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      await tx.sourceSnapshot.update({ where: { id: rows[0].id }, data: { status: "PROCESSING" } });
      return tx.sourceSnapshot.findUniqueOrThrow({ where: { id: rows[0].id }, include: { issue: { select: { title: true, description: true } } } });
    });
    if (!snapshot) return;
    const temp = await mkdtemp(path.join(tmpdir(), "br-source-")), work = path.join(temp, "work"), archive = path.join(temp, "source.tar.gz");
    const deadline = Date.now() + 120_000;
    const run = async (args: string[], cwd = temp) => { const result = await command(args, cwd, Math.max(1, deadline - Date.now())); if (result.code) throw new Error(result.log || "Source command failed"); return result.log.trim(); };
    try {
      let commitSha: string | null = null;
      await mkdir(work);
      if (snapshot.repoUrl) {
        if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(snapshot.repoUrl) || snapshot.repoUrl.endsWith(".git")) throw new Error("Invalid GitHub URL");
        const ref = snapshot.ref || "HEAD";
        if (ref.startsWith("-") || /[\s\x00]/.test(ref)) throw new Error("Invalid source ref");
        commitSha = (await run(["git", "ls-remote", "--", snapshot.repoUrl, ref])).split(/\s/)[0] ?? null;
        if (!commitSha || !/^[a-f0-9]{40}$/.test(commitSha)) throw new Error("Source ref not found");
        const repo = path.join(temp, "repo");
        await run(["git", "clone", "--filter=blob:none", "--no-checkout", "--", snapshot.repoUrl, repo]);
        commitSha = await run(["git", "rev-parse", `${commitSha}^{commit}`], repo);
        await run(["git", "archive", "--format=tar.gz", `--output=${archive}`, commitSha], repo);
        await extractArchive(archive, work);
      } else {
        const attachment = await db.attachment.findFirst({ where: { id: snapshot.attachmentId ?? "", issueId: snapshot.issueId, purpose: "SOURCE", status: "ATTACHED" } });
        if (!attachment) throw new Error("Source upload not found");
        const bytes = await readAttachment(attachment.fileUrl);
        if (createHash("sha256").update(bytes).digest("hex") !== attachment.sha256) throw new Error("Source checksum mismatch");
        const zip = path.join(temp, "source.zip"); await writeFile(zip, bytes); await extractArchive(zip, work);
      }
      const files = await textFiles(work), detected = detectFramework(files);
      await run(["python3", "-c", "import sys,tarfile; t=tarfile.open(sys.argv[1],'w:gz'); t.add(sys.argv[2],arcname='.'); t.close()", archive, work]);
      // shortcut: snapshots live on one worker's disk; move to shared storage before running multiple workers.
      await mkdir(config.snapshotDir, { recursive: true });
      const bytes = await readFile(archive), storagePath = path.join(config.snapshotDir, `${randomUUID()}.tar.gz`);
      await writeFile(storagePath, bytes);
      await db.$transaction((tx) => tx.sourceSnapshot.update({ where: { id: snapshot.id }, data: { ...detected, commitSha, storagePath, sha256: createHash("sha256").update(bytes).digest("hex"), context: sourceContext(files, `${snapshot.issue.title} ${snapshot.issue.description}`), status: "READY", error: null } }));
    } catch (error) { await db.$transaction((tx) => tx.sourceSnapshot.update({ where: { id: snapshot.id }, data: { status: "FAILED", error: String(error instanceof Error ? error.message : error).slice(0, 500) } })); }
    finally { await rm(temp, { recursive: true, force: true }); }
  },
};

