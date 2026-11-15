import { describe, expect, it } from "vitest";
import { rankSkills, type SkillRow } from "../lib/skill-match";

const row = (name: string, category = "Other"): SkillRow => ({ id: name, name, slug: name.toLowerCase(), category });
const rows = [row("JavaScript", "Languages"), row("Java", "Languages"), row("TypeScript", "Languages"), row("Node.js", "Backend"), row("React", "Frontend"), row("React Native", "Mobile"), row("Solidity", "Blockchain"), row("C++", "Languages"), row("Kubernetes", "DevOps & Cloud")];
const top = (query: string) => rankSkills(rows, query, 3).map((item) => item.name);

describe("rankSkills", () => {
  it("puts the exact name first", () => expect(top("java")[0]).toBe("Java"));
  it("resolves common aliases", () => { expect(top("js")[0]).toBe("JavaScript"); expect(top("k8s")[0]).toBe("Kubernetes"); expect(top("node")[0]).toBe("Node.js"); });
  it("matches the start of any word", () => expect(top("native")).toContain("React Native"));
  it("ignores punctuation and case", () => { expect(top("NODEJS")[0]).toBe("Node.js"); expect(top("c++")[0]).toBe("C++"); });
  it("tolerates one typo", () => expect(top("soliditi")[0]).toBe("Solidity"));
  it("forgives a missing letter", () => expect(top("typescrip")[0]).toBe("TypeScript"));
  it("matches category words", () => expect(top("blockchain")).toEqual(["Solidity"]));
});
