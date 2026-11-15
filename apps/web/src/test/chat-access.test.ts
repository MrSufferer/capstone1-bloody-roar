import { describe, expect, it } from "vitest";
import { canReadIssueChat, canWriteIssueChat, canReadConversation, canWriteConversation } from "../lib/chat-access";

const client = { id: "client-1", role: "CLIENT" };
const developer = { id: "dev-1", role: "DEVELOPER" };
const outsider = { id: "other-1", role: "DEVELOPER" };
const admin = { id: "admin-1", role: "ADMIN" };

describe("task chat access", () => {
  it("opens read/write access to the selected client and developer while work is active", () => {
    const issue = { clientId: client.id, developerId: developer.id, status: "IN_PROGRESS" };

    expect(canReadIssueChat(issue, client)).toBe(true);
    expect(canReadIssueChat(issue, developer)).toBe(true);
    expect(canWriteIssueChat(issue, client)).toBe(true);
    expect(canWriteIssueChat(issue, developer)).toBe(true);
    expect(canWriteIssueChat(issue, outsider)).toBe(false);
  });

  it("does not open a room before a developer is assigned", () => {
    const issue = { clientId: client.id, developerId: null, status: "OPEN" };

    expect(canReadIssueChat(issue, client)).toBe(false);
    expect(canWriteIssueChat(issue, client)).toBe(false);
  });

  it("keeps the chat writable while funding or a dispute is open", () => {
    for (const status of ["AWAITING_FUNDING", "IN_PROGRESS", "DISPUTED"]) {
      const issue = { clientId: client.id, developerId: developer.id, status };
      expect(canWriteIssueChat(issue, client)).toBe(true);
      expect(canWriteIssueChat(issue, developer)).toBe(true);
    }
  });

  it("keeps completed and cancelled history read-only for participants", () => {
    for (const status of ["COMPLETED", "CANCELLED"]) {
      const issue = { clientId: client.id, developerId: developer.id, status };
      expect(canReadIssueChat(issue, client)).toBe(true);
      expect(canWriteIssueChat(issue, client)).toBe(false);
    }
  });

  it("allows an administrator to inspect disputed evidence only", () => {
    expect(canReadIssueChat({ clientId: client.id, developerId: developer.id, status: "DISPUTED" }, admin)).toBe(true);
    expect(canReadIssueChat({ clientId: client.id, developerId: developer.id, status: "IN_PROGRESS" }, admin)).toBe(false);
    expect(canReadIssueChat({ clientId: client.id, developerId: developer.id, status: "COMPLETED" }, admin)).toBe(false);
    expect(canWriteIssueChat({ clientId: client.id, developerId: developer.id, status: "DISPUTED" }, admin)).toBe(false);
  });
});


describe("conversation permission matrix", () => {
  it.each([
    ["OPEN", "PENDING", client, true, true, true],
    ["OPEN", "PENDING", developer, true, true, true],
    ["OPEN", "PENDING", outsider, false, false, false],
    ["OPEN", "PENDING", admin, false, false, false],
    ["OPEN", "WITHDRAWN", developer, true, true, false],
    ["IN_PROGRESS", "REJECTED", developer, true, true, false],
    ["COMPLETED", "ACCEPTED", client, true, true, false],
  ] as const)("application %s/%s for %j", (status, applicationStatus, actor, participant, read, write) => {
    const issue = { clientId: client.id, developerId: null, status };
    const application = { status: applicationStatus, developerId: developer.id };
    expect(canReadConversation({ kind: "APPLICATION" }, issue, application, actor, participant)).toBe(read);
    expect(canWriteConversation({ kind: "APPLICATION" }, issue, application, actor, participant)).toBe(write);
  });
  it("requires work membership and lets disputed admins read without membership", () => {
    const issue = { clientId: client.id, developerId: developer.id, status: "DISPUTED" };
    expect(canReadConversation({ kind: "ISSUE_WORK" }, issue, null, client, false)).toBe(false);
    expect(canReadConversation({ kind: "ISSUE_WORK" }, issue, null, admin, false)).toBe(true);
    expect(canWriteConversation({ kind: "ISSUE_WORK" }, issue, null, admin, false)).toBe(false);
  });
});
