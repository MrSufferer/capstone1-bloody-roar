import { spawn } from "node:child_process";

const allowedEnv = new Set(["PATH", "HOME", "TMPDIR", "LANG", "DOCKER_HOST"]);

export async function command(args: string[], cwd: string, timeoutMs = 120_000): Promise<{ code: number; log: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    // Next.js types require NODE_ENV, but subprocesses intentionally receive only the allowlist.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowedEnv.has(key) || key.startsWith("GIT_"))) as NodeJS.ProcessEnv;
    const child = spawn(args[0]!, args.slice(1), { cwd, env: { ...env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "", timedOut = false;
    const collect = (chunk: Buffer) => { log = (log + chunk.toString()).slice(-20_000); };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, log, timedOut }); });
  });
}
