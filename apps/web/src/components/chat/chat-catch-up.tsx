"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { Button } from "@/components/ui/button";

type CatchUp = { status: "OK" | "EMPTY" | "AI_UNAVAILABLE"; summary: string | null; messageCount: number };

export function ChatCatchUp({ conversationId }: { conversationId: string }) {
  const [result, setResult] = useState<CatchUp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = () => {
    setLoading(true);
    setError(null);
    setResult(null);
    void graphqlRequest<{ summarizeConversation: CatchUp }>(`mutation CatchUp($id: ID!) { summarizeConversation(conversationId: $id) { status summary messageCount } }`, { id: conversationId })
      .then((data) => setResult(data.summarizeConversation))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not catch up."))
      .finally(() => setLoading(false));
  };

  const message = result?.status === "EMPTY" ? "You're all caught up" : result?.status === "AI_UNAVAILABLE" ? `AI unavailable · ${result.messageCount} unread message${result.messageCount === 1 ? "" : "s"}` : null;

  return (
    <div className="space-y-2 border-b border-[hsl(var(--border))] px-4 py-2.5 sm:px-5">
      <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={run}><Sparkles className="h-3.5 w-3.5" />{loading ? "Catching up…" : "Catch up"}</Button>
      {error && <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{error}</p>}
      {message && <p role="status" className="text-xs text-[hsl(var(--foreground-muted))]">{message}</p>}
      {result?.status === "OK" && result.summary && <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--foreground-subtle))]">AI-generated summary · advisory, check the messages before acting</p>
          <button type="button" onClick={() => setResult(null)} className="rounded p-1 hover:bg-[hsl(var(--card))]" aria-label="Dismiss summary"><X className="h-3.5 w-3.5" /></button>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{result.summary}</p>
      </div>}
    </div>
  );
}
