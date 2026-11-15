export function sensitiveSourceFile(key: string, content = ""): boolean {
  const name = key.split("/").pop()!.toLowerCase();
  return (name.startsWith(".env") && name !== ".env.example") || /\.(pem|key)$/.test(name) || name.startsWith("id_rsa") || /\b(?:[A-Z0-9_]*PRIVATE_KEY|[A-Z0-9_]*API_KEY|[A-Z0-9_]*SECRET)\b["']?\s*[:=]/im.test(content);
}

export function sanitizeSourceContext(context: string): string {
  const [listing = "", ...sections] = context.split(/\n\n--- /);
  const safe = sections.filter((section) => {
    const end = section.indexOf(" ---\n");
    return end >= 0 && !sensitiveSourceFile(section.slice(0, end), section.slice(end + 5));
  });
  const excluded = new Set(sections.filter((section) => !safe.includes(section)).map((section) => section.split(" ---\n")[0]));
  return [listing.split("\n").filter((key) => !sensitiveSourceFile(key) && !excluded.has(key)).join("\n"), ...safe.map((section) => `--- ${section}`)].join("\n\n");
}
