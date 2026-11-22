import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "../graphql/schema";
import { client } from "./helpers/users";

const { completeAI } = vi.hoisted(() => ({ completeAI: vi.fn() }));
vi.mock("../ai/model-router", async () => ({ ...(await vi.importActual<Record<string, unknown>>("../ai/model-router")), completeAI }));
const secret = ["sk-", "abcdefghijklmnopqrstuvwxyz012345"].join("");
const issue = { id: "scope-1", clientId: client.id, title: "Checkout", description: `API_KEY=${secret}`, category: "FEATURE", requiredSkills: ["TypeScript"] };
const db = { issue: { findUnique: vi.fn() } };
function call(user: unknown = client) {
  const field = schema.getMutationType()?.getFields().checkIssueScope;
  if (!field?.resolve) throw new Error("no resolver for checkIssueScope");
  return field.resolve({} as never, { issueId: issue.id }, { db, user } as never, {} as never);
}
beforeEach(() => { completeAI.mockReset(); db.issue.findUnique.mockResolvedValue(issue); });
describe("checkIssueScope", () => {
  it("returns validated suggestions and masks secrets", async () => {
    const output = { ambiguities: ["Which currency?"], openQuestions: ["Which provider?"], difficulty: "MEDIUM" };
    completeAI.mockResolvedValue({ text: JSON.stringify(output) });
    await expect(call()).resolves.toEqual({ status: "OK", ...output });
    const sent = JSON.stringify(completeAI.mock.calls[0]?.[0]);
    expect(sent).not.toContain(secret);
    expect(sent).toContain("[REDACTED]");
  });
  it("trims and limits scope suggestions without discarding the response", async () => {
    const suggestions = Array.from({ length: 9 }, (_, index) => `Suggestion ${index + 1}`);
    completeAI.mockResolvedValue({ text: JSON.stringify({
      ambiguities: [` ${"a".repeat(400)} `, ...suggestions.slice(1)],
      openQuestions: [" ", ...suggestions],
      difficulty: "MEDIUM",
    }) });
    await expect(call()).resolves.toEqual({
      status: "OK",
      ambiguities: ["a".repeat(300), ...suggestions.slice(1, 8)],
      openQuestions: suggestions.slice(0, 8),
      difficulty: "MEDIUM",
    });
  });
  it.each(["error", "bad json", "bad schema"])("returns unavailable for %s", async (kind) => {
    if (kind === "error") completeAI.mockRejectedValue(new Error("provider failed"));
    else completeAI.mockResolvedValue({ text: kind === "bad json" ? "{" : JSON.stringify({ ambiguities: [], openQuestions: [], difficulty: "UNKNOWN" }) });
    await expect(call()).resolves.toEqual({ status: "AI_UNAVAILABLE", ambiguities: [], openQuestions: [], difficulty: null });
  });
  it("returns unavailable when a required field is missing", async () => {
    completeAI.mockResolvedValue({ text: JSON.stringify({ ambiguities: [], difficulty: "MEDIUM" }) });
    await expect(call()).resolves.toEqual({ status: "AI_UNAVAILABLE", ambiguities: [], openQuestions: [], difficulty: null });
  });
  it("rejects non-owners and unauthenticated users before calling the model", async () => {
    db.issue.findUnique.mockResolvedValueOnce({ ...issue, clientId: "someone-else" });
    await expect(call()).rejects.toMatchObject({ extensions: { code: "FORBIDDEN" } });
    await expect(call(null)).rejects.toThrow();
    expect(completeAI).not.toHaveBeenCalled();
  });
});
