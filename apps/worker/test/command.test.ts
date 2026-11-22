import { expect, test } from "bun:test";
import { command } from "../src/runner/command";

test("child processes receive only allowed environment variables and fixed Git settings", async () => {
  const injected = {
    DATABASE_URL: "postgresql://sentinel.invalid/secret",
    RELAYER_PRIVATE_KEY: "sentinel-relayer-key",
    WORKER_OTHER_SECRET: "sentinel-other-secret",
    LANG: "C.UTF-8",
    DOCKER_HOST: "unix:///tmp/sentinel-docker.sock",
    GIT_TRACE: "0",
    GIT_CONFIG_GLOBAL: "/tmp/untrusted-git-config",
    GIT_CONFIG_NOSYSTEM: "0",
    GIT_TERMINAL_PROMPT: "1",
  };
  const previous = Object.fromEntries(Object.keys(injected).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, injected);
    // Disable Bun's own .env loading so this measures inherited environment only.
    const result = await command([process.execPath, "--no-env-file", "-e", "console.log(JSON.stringify(process.env))"], process.cwd());
    expect(result.code).toBe(0);
    const env = JSON.parse(result.log) as Record<string, string>;
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.RELAYER_PRIVATE_KEY).toBeUndefined();
    expect(env.WORKER_OTHER_SECRET).toBeUndefined();
    expect(Object.keys(env).filter((key) =>
      !["PATH", "HOME", "TMPDIR", "LANG", "DOCKER_HOST"].includes(key) && !key.startsWith("GIT_")
    )).toEqual([]);
    for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "DOCKER_HOST", "GIT_TRACE"]) {
      expect(env[key]).toBe(process.env[key]);
    }
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.GIT_CONFIG_NOSYSTEM).toBe("1");
    expect(env.GIT_CONFIG_GLOBAL).toBe("/dev/null");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
