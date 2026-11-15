"use client";

// apps/web/src/app/providers.tsx
// Global providers wrapper

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { Toaster } from "@/components/ui/toaster";
import { UiPreferencesProvider } from "@/lib/ui-preferences";

export function Providers({ children }: { children: ReactNode }) {
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  useEffect(() => {
    // Remove JWTs persisted by older builds. Authentication now uses an
    // HttpOnly cookie managed by the server.
    window.localStorage.removeItem("bloody-roar-auth");
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (previous.user && !state.user) {
      queryClient.removeQueries({ queryKey: ["issue-detail"] });
      queryClient.removeQueries({ queryKey: ["notifications"] });
    }
  }), [queryClient]);

  return (
    <UiPreferencesProvider>
      <QueryClientProvider client={queryClient}>{children}<Toaster /></QueryClientProvider>
    </UiPreferencesProvider>
  );
}
