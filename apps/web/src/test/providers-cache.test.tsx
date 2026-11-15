import { act, render } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/ui-preferences", () => ({ UiPreferencesProvider: ({ children }: { children: React.ReactNode }) => children }));

describe("logout cache", () => {
  it("removes private queries and retains public marketplace data", () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: {} } as never);
    useAuthStore.setState({ user: { id: "u", role: "CLIENT" } as never, status: "authenticated" });
    let client!: QueryClient;
    function Capture() { client = useQueryClient(); return null; }
    render(<Providers><Capture /></Providers>);
    client.setQueryData(["issue-detail", "i", "u"], { secret: true });
    client.setQueryData(["notifications", "u"], { secret: true });
    client.setQueryData(["marketplace-issues", {}], { public: true });
    act(() => useAuthStore.getState().logout());
    expect(client.getQueryData(["issue-detail", "i", "u"])).toBeUndefined();
    expect(client.getQueryData(["notifications", "u"])).toBeUndefined();
    expect(client.getQueryData(["marketplace-issues", {}])).toEqual({ public: true });
  });
});
