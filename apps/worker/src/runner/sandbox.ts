import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validTestPath } from "@bloody-roar/shared/test-runner";
import { command } from "./command";

export type CaseResult = { testCaseId: string; status: "passed" | "failed" | "skipped"; message?: string };
export function parseVitest(text: string): CaseResult[] {
  const report = JSON.parse(text) as { testResults?: Array<{ assertionResults?: Array<{ fullName?: string; title?: string; status: string; failureMessages?: string[] }> }> };
  return (report.testResults ?? []).flatMap((suite) => (suite.assertionResults ?? []).flatMap((test) => {
    const id = (test.fullName ?? test.title ?? "").match(/\[TC:([^\]]+)\]/)?.[1];
    return id ? [{ testCaseId: id, status: test.status === "passed" ? "passed" as const : test.status === "pending" || test.status === "skipped" ? "skipped" as const : "failed" as const, message: (test.failureMessages ?? []).join("\n").slice(0, 2000) }] : [];
  }));
}
export function completeResults(ids: string[], results: CaseResult[]): CaseResult[] {
  return ids.map((id) => {
    const matches = results.filter((r) => r.testCaseId === id);
    return matches.find((r) => r.status === "failed") ?? matches.find((r) => r.status === "skipped") ?? matches[0] ?? { testCaseId: id, status: "failed", message: "No result" };
  });
}
const archiveScript = fileURLToPath(new URL("./archive.py", import.meta.url));
export async function extractArchive(archive: string, destination: string) {
  const result = await command(["python3", archiveScript, archive, destination], destination);
  if (result.code) throw new Error(result.log || "Invalid archive");
}
export async function parseJunit(file: string): Promise<CaseResult[]> {
  const result = await command(["python3", "-c", `import json,re,sys,xml.etree.ElementTree as E
r=[]
for t in E.parse(sys.argv[1]).iter('testcase'):
 m=re.search(r'\\[TC:([^\\]]+)\\]',t.get('name',''))
 if m is not None:
  bad=t.find('failure')
  if bad is None: bad=t.find('error')
  r.append(dict(testCaseId=m.group(1),status='failed' if bad is not None else 'skipped' if t.find('skipped') is not None else 'passed',message=(''.join(bad.itertext())[:2000] if bad is not None else '')))
print(json.dumps(r))`, file], path.dirname(file));
  if (result.code) throw new Error("Invalid JUnit report");
  return JSON.parse(result.log) as CaseResult[];
}
export async function runInSandbox(input: { snapshotPath: string; patchPath?: string; files: { id: string; path: string; code: string }[]; framework: "VITEST" | "PYTEST"; installCommand: string; timeoutMs?: number }) {
  const root = await mkdtemp(path.join(tmpdir(), "br-run-")), work = path.join(root, "work");
  const name = `br-${randomUUID()}`;
  let log = "";
  const finish = (status: "passed" | "failed" | "error" | "timeout", results: CaseResult[] = []) => ({ status, results, log: log.slice(-20_000) });
  try {
    if (!input.files.length || input.files.some((f) => !validTestPath(f.path)) || new Set(input.files.map((f) => f.path)).size !== input.files.length) throw new Error("Invalid test file paths");
    await mkdir(work); await extractArchive(input.snapshotPath, work);
    let pytestConfig: { name: string; content: string } | undefined;
    if (input.framework === "PYTEST") {
      for (const name of ["pytest.ini", "pyproject.toml", "tox.ini", "setup.cfg"]) {
        const content = await readFile(path.join(work, name), "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
        if (content === null) continue;
        if (name === "pyproject.toml" && !/^\s*\[tool\.pytest\.ini_options\]\s*(?:#.*)?$/m.test(content)) continue;
        if (name === "tox.ini" && !/^\s*\[pytest\]\s*(?:[#;].*)?$/m.test(content)) continue;
        if (name === "setup.cfg" && !/^\s*\[tool:pytest\]\s*(?:[#;].*)?$/m.test(content)) continue;
        pytestConfig = { name, content }; break;
      }
    }
    // Vitest needs Node worker threads; Bun remains the package installer.
    const image = input.framework === "VITEST" ? "bloodyroar-test-runner:1" : "python:3.12-slim";
    const docker = async (script: string, network: "none" | "bridge", timeout: number) => {
      const args = ["docker", "run", "--rm", "--name", name, "--network", network, "--memory", "2g", "--cpus", "2", "--pids-limit", "256", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=256m", "--user", "1000:1000", "-e", "HOME=/tmp", "-e", "PYTHONPATH=/work/.br-deps:/work/src", "-v", `${work}:/work`, "-w", "/work", image, "sh", "-c", script];
      const result = await command(args, work, timeout);
      log = (log + result.log).slice(-20_000);
      if (result.timedOut) await command(["docker", "rm", "-f", name], work, 10_000);
      return result;
    };
    if (input.patchPath) {
      await writeFile(path.join(work, ".br.patch"), await readFile(input.patchPath));
      // git apply does not execute project code and rejects paths outside the work tree.
      const initialized = await command(["git", "init", "-q"], work);
      if (initialized.code) throw new Error("Could not initialize patch work tree");
      let stdout: string;
      try {
        ({ stdout } = await promisify(execFile)("git", ["apply", "--numstat", "-z", ".br.patch"], { cwd: work, maxBuffer: 10_000_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }));
      } catch { log += "Patch does not apply"; return finish("error"); }
      const fields = stdout.split("\0");
      for (let i = 0; i < fields.length; i++) {
        const entry = fields[i]!;
        if (!entry) continue;
        const name = entry.slice(entry.indexOf("\t", entry.indexOf("\t") + 1) + 1);
        const paths = name ? [name] : [fields[++i] ?? "", fields[++i] ?? ""];
        // Vitest 2.1.9 also loads workspace files with --config, so patches must not change them.
        if (paths.some((p) => /^(?:conftest\.py|pytest\.ini|sitecustomize\.py|usercustomize\.py|vitest\.config\..+|vite\.config\..+|vitest\.workspace\..+)$/.test(path.posix.basename(p)))) {
          log += "PATCH_TOUCHES_RUNNER_CONFIG"; return finish("error");
        }
      }
      const checked = await command(["git", "apply", "--check", ".br.patch"], work);
      const patch = checked.code ? checked : await command(["git", "apply", ".br.patch"], work);
      log += patch.log;
      if (patch.code) { log += "\nPatch does not apply"; return finish(patch.timedOut ? "timeout" : "error"); }
    }
    await rm(path.join(work, "__bloodyroar__"), { recursive: true, force: true });
    for (const file of input.files) {
      let current = work;
      for (const part of file.path.split("/")) {
        current = path.join(current, part);
        const stat = await lstat(current).catch(() => null);
        if (stat?.isSymbolicLink()) throw new Error("Symlink in test path");
      }
      await mkdir(path.dirname(current), { recursive: true, mode: 0o777 });
      await chmod(path.dirname(current), 0o777);
      await writeFile(current, file.code, { mode: 0o666 });
    }
    let testConfig: string;
    if (input.framework === "VITEST") {
      const candidates = ["vitest.config", "vite.config"].flatMap((name) => ["js", "mjs", "ts", "cjs", "mts", "cts"].map((ext) => name + "." + ext));
      let projectConfig: string | undefined;
      for (const name of candidates) if (await lstat(path.join(work, name)).then((stat) => stat.isFile(), () => false)) { projectConfig = name; break; }
      testConfig = ".br-vitest.config.mjs";
      await rm(path.join(work, testConfig), { recursive: true, force: true });
      const base = projectConfig ? `import project from ${JSON.stringify("./" + projectConfig)};` : "const project = {};";
      await writeFile(path.join(work, testConfig), `${base} export default async (env) => { const config = await (typeof project === "function" ? project(env) : project); return { ...config, test: { ...config.test, include: ${JSON.stringify(input.files.map((f) => f.path))} } }; };`);
    } else {
      const dir = path.join(work, ".br-pytest-config");
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir);
      testConfig = `.br-pytest-config/${pytestConfig?.name ?? "pytest.ini"}`;
      await writeFile(path.join(work, testConfig), pytestConfig?.content ?? "[pytest]\n");
    }
    if (input.framework === "PYTEST") await writeFile(path.join(work, ".br-install.py"), await readFile(new URL("./install-python.py", import.meta.url)));
    const install = input.framework === "VITEST" ? "bun install --ignore-scripts" : "python -I .br-install.py";
    const installed = await docker(install, "bridge", 300_000);
    if (installed.code) return finish(installed.timedOut ? "timeout" : "error");
    const testPaths = input.files.map((file) => `'${file.path.replaceAll("'", "'\\''")}'`).join(" ");
    const result = await docker(input.framework === "VITEST" ? `node node_modules/vitest/vitest.mjs run --config .br-vitest.config.mjs ${testPaths} --reporter=json --outputFile=/work/.br-results.json` : `python -m pytest -c ${testConfig} --rootdir=/work -p no:cacheprovider ${testPaths} --junitxml=/work/.br-results.xml -q`, "none", input.timeoutMs ?? 600_000);
    if (result.timedOut) return finish("timeout");
    const report = path.join(work, input.framework === "VITEST" ? ".br-results.json" : ".br-results.xml");
    const stat = await lstat(report);
    if (!stat.isFile() || stat.size > 2_000_000) throw new Error("Invalid or oversized test report");
    const text = await readFile(report, "utf8");
    const parsed = input.framework === "VITEST" ? parseVitest(text) : await parseJunit(report);
    if (input.framework === "VITEST") {
      const suites = (JSON.parse(text) as { testResults?: Array<{ message?: string }> }).testResults ?? [];
      for (const suite of suites) if (suite.message) log = (log + "\n" + suite.message).slice(-20_000);
    }
    if (!parsed.length) log = (log + "\nNo assertion results: " + text.slice(-6000)).slice(-20_000);
    const results = completeResults(input.files.map((f) => f.id), parsed);
    return finish(result.code === 0 && results.every((r) => r.status === "passed") ? "passed" : "failed", results);
  } catch (error) { log += `\n${error instanceof Error ? error.message : String(error)}`; return finish("error"); }
  finally { await command(["docker", "rm", "-f", name], root, 10_000).catch(() => undefined); await rm(root, { recursive: true, force: true }); }
}
