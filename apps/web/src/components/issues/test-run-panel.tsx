"use client";
import { useCallback, useEffect, useState } from "react";
import { graphqlRequest } from "@/lib/graphql-client";
import { Button } from "@/components/ui/button";

type Run = { id: string; kind: string; status: string; results: string | null; log: string | null; createdAt: string };
export function TestRunPanel({ issueId, submissionId, canRun = false, onPassed }: { issueId: string; submissionId?: string; canRun?: boolean; onPassed?: (passed: boolean) => void }) {
  const [runs, setRuns] = useState<Run[]>([]), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await graphqlRequest<{ testRuns: Run[] }>(`query Runs($issue: ID!, $submission: ID) { testRuns(issueId: $issue, submissionId: $submission) { id kind status results log createdAt } }`, { issue: issueId, submission: submissionId ?? null });
      setRuns(data.testRuns); onPassed?.(data.testRuns[0]?.status === "PASSED");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load tests"); }
  }, [issueId, submissionId, onPassed]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 5000); return () => clearInterval(timer); }, [load]);
  const run = async () => {
    setBusy(true); setError(null); onPassed?.(false);
    try { await graphqlRequest(`mutation RunTests($id: ID!) { runSubmissionTests(submissionId: $id) { id } }`, { id: submissionId }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not queue tests"); }
    finally { setBusy(false); }
  };
  const latest = runs[0], results = latest?.results ? JSON.parse(latest.results) as Array<{ testCaseId: string; status: string; message?: string }> : [];
  return <section className="my-3 rounded-lg border border-[var(--line)] p-3 text-sm">
    {canRun && submissionId && <Button type="button" variant="outline" disabled={busy || ["QUEUED", "RUNNING"].includes(latest?.status ?? "")} onClick={() => void run()}>Run tests</Button>}
    {error && <p role="alert">{error}</p>}
    {latest ? <><p className="mt-2">{latest.kind}: {latest.status} · {results.filter((r) => r.status === "passed").length}/{results.length} tests passed</p>
      <ul>{results.map((r) => <li key={r.testCaseId}>{r.testCaseId}: {r.status}{r.message && <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{r.message}</pre>}</li>)}</ul>
      <details className="mt-2"><summary>View test log</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{latest.log || "No log yet."}</pre></details></> : <p>No test runs yet.</p>}
  </section>;
}
