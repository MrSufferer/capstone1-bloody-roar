export function isAllowedDatabase(url: string | undefined, override?: string): boolean {
  if (override === "1") return true;
  try {
    return ["localhost", "127.0.0.1"].includes(new URL(url!).hostname);
  } catch {
    return false;
  }
}

if ((import.meta as ImportMeta & { main?: boolean }).main && !isAllowedDatabase(process.env.DATABASE_URL, process.env.ALLOW_REMOTE_DB)) {
  console.error("DATABASE_URL must point to localhost or 127.0.0.1; set ALLOW_REMOTE_DB=1 to override.");
  process.exit(1);
}
