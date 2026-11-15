import { describe, expect, test } from "bun:test";
import { isAllowedDatabase } from "../scripts/assert-local-db";

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
});
