import { describe, expect, test } from "bun:test";
import { isAllowedDatabase } from "../scripts/assert-local-db";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("local database guard", () => {
  test("allows localhost and loopback", () => {
    expect(isAllowedDatabase("postgresql://localhost/db")).toBe(true);
    expect(isAllowedDatabase("postgresql://127.0.0.1/db")).toBe(true);
  });
  test("rejects remote and invalid URLs unless explicitly overridden", () => {
    expect(isAllowedDatabase("postgresql://db.supabase.com/db")).toBe(false);
    expect(isAllowedDatabase(undefined)).toBe(false);
    expect(isAllowedDatabase("postgresql://db.supabase.com/db", "1")).toBe(true);
  });
  test.each([
    ["postgresql://db.supabase.com/db", "postgresql://localhost/db", "DATABASE_URL"],
    ["postgresql://localhost/db", "postgresql://db.supabase.com/db", "DIRECT_URL"],
    ["postgresql://localhost/db", "invalid", "DIRECT_URL"],
    ["postgresql://localhost/db", "", "DIRECT_URL"],
  ])("db:migrate guards DATABASE_URL=%s and DIRECT_URL=%s before invoking Prisma", async (databaseUrl, directUrl, rejected) => {
    const dir = await mkdtemp(path.join(tmpdir(), "br-migrate-"));
    try {
      await writeFile(path.join(dir, "prisma"), "#!/bin/sh\necho PRISMA_INVOKED\n", { mode: 0o755 });
      const { scripts } = await Bun.file(new URL("../package.json", import.meta.url)).json();
      const result = Bun.spawnSync(["sh", "-c", scripts["db:migrate"]], {
        cwd: path.resolve(import.meta.dir, ".."),
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl, ALLOW_REMOTE_DB: "0" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain(`${rejected} must point to localhost`);
      expect(result.stdout.toString()).not.toContain("PRISMA_INVOKED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
