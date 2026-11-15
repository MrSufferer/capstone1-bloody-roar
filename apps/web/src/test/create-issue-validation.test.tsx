import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateIssueForm } from "@/components/issues/create-issue-form";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { request, push } = vi.hoisted(() => ({ request: vi.fn(async (query: string) => query.includes("mutation CreateIssue")
  ? { createIssue: { id: "new-issue", title: "A valid title", status: "OPEN" } }
  : { tokens: [{ id: "token", symbol: "USDC", name: "USD", decimals: 6, chainId: 1 }] }), push: vi.fn() }));
vi.mock("@/lib/graphql-client", () => ({ graphqlRequest: request }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/ui-preferences", () => ({ useUiPreferences: () => ({ language: "en", theme: "light", t: (key: string) => key }) }));

function renderForm() {
  const client = new QueryClient();
  return { ...render(<QueryClientProvider client={client}><CreateIssueForm /></QueryClientProvider>), client };
}

describe("create issue validation", () => {
  it("shows field errors when invalid fields are submitted or blurred", async () => {
    useAuthStore.setState({ user: { id: "u", role: "CLIENT" } as never, status: "authenticated" });
    renderForm();
    await waitFor(() => expect(screen.getByRole("button", { name: "publishBounty" })).not.toBeDisabled());
    fireEvent.invalid(screen.getByLabelText("titleLabel"));
    fireEvent.blur(screen.getByLabelText("descriptionLabel"));
    expect(screen.getByText("Title must contain 10–120 characters.")).toBeTruthy();
    expect(screen.getByText("Scope must contain 30–5000 characters.")).toBeTruthy();
  });
  it.each(["          ", "  short  "])("rejects a title that is too short after trimming: %j", async (title) => {
    useAuthStore.setState({ user: { id: "u", role: "CLIENT" } as never, status: "authenticated" });
    renderForm();
    await waitFor(() => expect(screen.getByRole("button", { name: "publishBounty" })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("titleLabel"), { target: { value: title } });
    fireEvent.change(screen.getByLabelText("descriptionLabel"), { target: { value: "A sufficiently detailed scope for this bounty." } });
    fireEvent.submit(screen.getByRole("button", { name: "publishBounty" }).closest("form")!);
    expect(screen.getByText("Title must contain 10–120 characters.")).toBeTruthy();
    expect(request.mock.calls.every(([query]) => !query.includes("mutation CreateIssue"))).toBe(true);
  });

  it("invalidates marketplace pages and navigates after creating an issue", async () => {
    useAuthStore.setState({ user: { id: "u", role: "CLIENT" } as never, status: "authenticated" });
    const { client } = renderForm();
    client.setQueryData(["marketplace-issues", { search: "test" }], { issues: [] });
    await waitFor(() => expect(screen.getByRole("button", { name: "publishBounty" })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("titleLabel"), { target: { value: "A valid issue title" } });
    fireEvent.change(screen.getByLabelText("descriptionLabel"), { target: { value: "A sufficiently detailed scope for this bounty." } });
    fireEvent.submit(screen.getByRole("button", { name: "publishBounty" }).closest("form")!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/issues/new-issue"));
    expect(client.getQueryState(["marketplace-issues", { search: "test" }])?.isInvalidated).toBe(true);
  });
});
