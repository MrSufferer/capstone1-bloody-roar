import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SourcePanel } from "../components/issues/source-panel";

const { request, upload } = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }));
vi.mock("../lib/graphql-client", () => ({ graphqlRequest: request }));
vi.mock("../lib/upload", () => ({ uploadFile: upload }));

beforeEach(() => {
  request.mockReset(); upload.mockReset();
  request.mockImplementation(async (query: string) => query.includes("query Source")
    ? { issueSource: null }
    : { setIssueSource: { status: "READY", framework: null, repoUrl: null, ref: null, commitSha: null, error: null } });
});

it("uses the bounty repository without asking for it again", async () => {
  const repository = "https://github.com/owner/project";
  const view = render(<SourcePanel issueId="issue1" editable />);
  await screen.findByRole("button", { name: "Prepare from GitHub" });
  view.rerender(<SourcePanel issueId="issue1" repository={repository} editable />);
  expect(screen.getByLabelText("Repository URL")).toHaveValue(repository);
  fireEvent.click(screen.getByRole("button", { name: "Prepare from GitHub" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("mutation SetSource"), { id: "issue1", repo: repository, ref: "HEAD", file: null }));
});

it("uploads a ZIP as the alternative source", async () => {
  upload.mockResolvedValue({ attachmentId: "attachment1" });
  render(<SourcePanel issueId="issue1" repository="https://github.com/owner/project" editable />);
  await screen.findByRole("button", { name: "Prepare from GitHub" });
  fireEvent.change(screen.getByLabelText("Choose and upload ZIP"), { target: { files: [new File(["source"], "source.zip", { type: "application/zip" })] } });
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("mutation SetSource"), { id: "issue1", repo: null, ref: null, file: "attachment1" }));
});

it("explains an incomplete GitHub repository URL before sending it", async () => {
  render(<SourcePanel issueId="issue1" repository="https://github.com/bloody-roar" editable />);
  fireEvent.click(await screen.findByRole("button", { name: "Prepare from GitHub" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a full repository URL, such as https://github.com/owner/repo");
  expect(request.mock.calls.some(([query]) => typeof query === "string" && query.includes("mutation SetSource"))).toBe(false);
  fireEvent.change(screen.getByLabelText("Repository URL"), { target: { value: "https://github.com/bloody-roar/project" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Prepare from GitHub" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("mutation SetSource"), { id: "issue1", repo: "https://github.com/bloody-roar/project", ref: "HEAD", file: null }));
});
