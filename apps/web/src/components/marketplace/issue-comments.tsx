"use client";

import { useToastState } from "@/lib/toast";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ImagePlus, MessageCircle, Send } from "lucide-react";
import { uploadFile } from "@/lib/upload";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { useUiPreferences } from "@/lib/ui-preferences";
import { Button } from "@/components/ui/button";

const ConnectModal = dynamic(() => import("@/components/auth/connect-modal").then((m) => m.ConnectModal), { ssr: false });

const COMMENTS_QUERY = `query IssueComments($issueId: String!) {
  issueComments(issueId: $issueId) {
    id body createdAt user { id name avatar role walletAddress }
  }
}`;
const ADD_COMMENT = `mutation AddIssueComment($input: CreateIssueCommentInput!) {
  createIssueComment(input: $input) {
    id body createdAt user { id name avatar role walletAddress }
  }
}`;

type IssueComment = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name?: string | null; role: string; walletAddress: string };
};

const IMAGE_MD = /!\[image\]\((\S+?)\)/g;

// Pictures are stored as ![image](url); only our own upload URLs render as images.
function CommentBody({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(IMAGE_MD)) {
    parts.push(text.slice(last, match.index));
    const url = match[1] ?? "";
    let own = false;
    try { const parsed = new URL(url, window.location.origin); own = parsed.origin === window.location.origin && parsed.pathname === "/api/uploads" && parsed.searchParams.has("key"); } catch { /* not a URL */ }
    // eslint-disable-next-line @next/next/no-img-element
    parts.push(own ? <a key={match.index} href={url} target="_blank" rel="noreferrer" className="my-2 block"><img src={url} alt="Attached" className="max-h-72 max-w-full rounded-lg border border-[hsl(var(--border))]" /></a> : match[0]);
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function IssueComments({ issueId, ownerId }: { issueId: string; ownerId: string }) {
  const user = useAuthStore((state) => state.user);
  const { t } = useUiPreferences();
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [, setError] = useToastState("error");
  const [loginOpen, setLoginOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const attachImages = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    setUploading(true); setError(null);
    try {
      for (const file of images) {
        const { fileUrl } = await uploadFile(file, "COMMENT_IMAGE");
        setBody((current) => `${current}${current && !current.endsWith("\n") ? "\n" : ""}![image](${fileUrl})\n`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not upload the picture."); }
    finally { setUploading(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await graphqlRequest<{ issueComments: IssueComment[] }>(COMMENTS_QUERY, { issueId });
      setComments(result.issueComments);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load comments.");
    } finally {
      setLoading(false);
    }
  }, [issueId, setError]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await graphqlRequest<{ createIssueComment: IssueComment }>(ADD_COMMENT, { input: { issueId, body: body.trim() } });
      setComments((current) => [...current, result.createIssueComment]);
      setBody("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add this comment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass rounded-xl p-5 sm:p-7" aria-labelledby="issue-comments-heading">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-[hsl(var(--primary))]" />
        <h2 id="issue-comments-heading" className="font-outfit text-xl font-bold">{t("comments")}</h2>
        <span className="rounded-full bg-[hsl(var(--background-secondary))] px-2 py-0.5 text-xs text-[hsl(var(--foreground-muted))]">{comments.length}</span>
      </div>

      <div className="mt-4 divide-y divide-[hsl(var(--border))]">
        {loading ? <div className="h-16 animate-pulse rounded-lg bg-[hsl(var(--muted))]" /> : comments.length ? comments.map((comment) => (
          <article key={comment.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <strong>{comment.user.name || `${comment.user.walletAddress.slice(0, 6)}…${comment.user.walletAddress.slice(-4)}`}</strong>
              {(comment.user.role === "ADMIN" || comment.user.id === ownerId) && <span className="rounded-full bg-[hsl(var(--background-secondary))] px-2 py-0.5 text-[10px] text-[hsl(var(--foreground-muted))]">{comment.user.role === "ADMIN" ? "Admin" : "Owner"}</span>}
              <time className="text-[hsl(var(--foreground-subtle))]" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[hsl(var(--foreground-muted))]"><CommentBody text={comment.body} /></p>
          </article>
        )) : <p className="py-5 text-sm text-[hsl(var(--foreground-muted))]">{t("noComments")}</p>}
      </div>

      {user ? <form onSubmit={submit} className="mt-5 border-t border-[hsl(var(--border))] pt-4">
        <label htmlFor="issue-comment-input" className="sr-only">{t("commentPlaceholder")}</label>
        <textarea id="issue-comment-input" value={body} onChange={(event) => setBody(event.target.value)} onPaste={(event) => { const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/")); if (images.length) { event.preventDefault(); void attachImages(images); } }} maxLength={1200} minLength={2} rows={3} placeholder={t("commentPlaceholder")} className="w-full resize-y rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-3 text-sm outline-none focus:border-[hsl(var(--primary)/0.5)]" />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"><ImagePlus className="h-4 w-4" />{uploading ? "Uploading…" : "Add image"}<input type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={(event) => { void attachImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label><span className="text-[10px] text-[hsl(var(--foreground-subtle))]">{body.length}/1200 · paste a screenshot to attach</span></div>
          <Button type="submit" size="sm" disabled={saving || uploading || body.trim().length < 2}><Send className="mr-2 h-3.5 w-3.5" />{t("addComment")}</Button>
        </div>
      </form> : <div className="mt-5 border-t border-[hsl(var(--border))] pt-4">
        <Button variant="outline" size="sm" onClick={() => setLoginOpen(true)}>{t("signInToComment")}</Button>
        {loginOpen && <ConnectModal isOpen onClose={() => setLoginOpen(false)} />}
      </div>}
    </section>
  );
}
