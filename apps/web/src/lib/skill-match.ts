// Ranks catalogue skills for a typed query: aliases, prefixes, word starts, category words and small typos.
export type SkillRow = { id: string; name: string; slug: string; category: string };

// Short names people actually type, mapped to the normalized catalogue name.
const ALIASES: Record<string, string[]> = {
  js: ["javascript"], ts: ["typescript"], py: ["python"], golang: ["go"], sol: ["solidity"], rs: ["rust"],
  node: ["nodejs"], reactjs: ["react"], vue: ["vuejs"], nextjs: ["next"], k8s: ["kubernetes"], postgres: ["postgresql"],
  mongo: ["mongodb"], tf: ["terraform"], ml: ["machinelearning"], ai: ["machinelearning", "artificialintelligence"],
  ui: ["uidesign", "figma"], ux: ["uxdesign", "figma"], web3: ["solidity", "ethereum"], eth: ["ethereum"], cpp: ["cplusplus"], csharp: ["c"],
};

export const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#]/g, "").replace(/\+\+/g, "pp").replace(/#/g, "sharp");

function editDistanceAtMost1(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function score(skill: SkillRow, query: string): number {
  const name = norm(skill.name), slug = norm(skill.slug);
  const aliases = ALIASES[query] ?? [];
  if (name === query || slug === query) return 100;
  if (aliases.some((alias) => alias === name || alias === slug)) return 95;
  if (name.startsWith(query)) return 80 - Math.min(name.length - query.length, 20) / 4;
  const words = skill.name.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
  if (words.some((word) => norm(word).startsWith(query))) return 70;
  if (name.includes(query)) return 50;
  if (norm(skill.category).startsWith(query)) return 40;
  if (query.length >= 4 && (editDistanceAtMost1(name, query) || editDistanceAtMost1(name.slice(0, query.length), query))) return 30;
  return 0;
}

export function rankSkills(rows: SkillRow[], rawQuery: string, limit: number): SkillRow[] {
  const query = norm(rawQuery);
  if (!query) return rows.slice(0, limit);
  return rows
    .map((row) => ({ row, points: score(row, query) }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.row.name.length - b.row.name.length || a.row.name.localeCompare(b.row.name))
    .slice(0, limit)
    .map((entry) => entry.row);
}
