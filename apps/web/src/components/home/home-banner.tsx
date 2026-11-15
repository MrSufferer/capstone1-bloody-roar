"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageSquare, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { shortenAddress } from "@/lib/utils";

const NODE = `id title description category bountyAmount { formatted } token { symbol } requiredSkills
  viewCount applicationCount commentCount expiresAt createdAt client { id }`;
// One round trip, three pools: highest reward, nearest deadline, newest (trending pool).
const BANNER_QUERY = `query HomeBanner {
  top: issues(first: 30, status: OPEN, sortBy: BOUNTY_AMOUNT, sortOrder: DESC) { edges { node { ${NODE} } } }
  closing: issues(first: 10, status: OPEN, sortBy: DEADLINE, sortOrder: ASC) { edges { node { ${NODE} } } }
  recent: issues(first: 50, status: OPEN, sortBy: CREATED_AT, sortOrder: DESC) { edges { node { ${NODE} } } }
}`;

type RawNode = {
  id: string; title: string; description: string; category: string; bountyAmount: { formatted: string }; token: { symbol: string };
  requiredSkills: string[]; viewCount: number; applicationCount: number; commentCount: number;
  expiresAt?: string | null; createdAt: string; client: { id: string };
};
type Pool = { edges: Array<{ node: RawNode }> };
type Bounty = Omit<RawNode, "bountyAmount"> & { amount: number };

const toBounties = (pool?: Pool): Bounty[] =>
  (pool?.edges ?? []).map(({ node }) => ({ ...node, amount: Number(node.bountyAmount.formatted) }));

const DAY = 86_400_000;
// Trending = discussion + applicants, weighted over bounties posted in the last 30 days.
const heat = (b: Bounty) => b.applicationCount * 3 + b.commentCount * 2 + b.viewCount * 0.2;

const TABS = [
  { key: "trending", label: "Trending" },
  { key: "reward", label: "Top reward" },
  { key: "closing", label: "Closing soon" },
  { key: "underserved", label: "Needs applicants" },
  { key: "new", label: "New" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function timeLeft(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  return h < 48 ? `${h}h left` : `${Math.floor(h / 24)}d left`;
}

export type BannerStats = { open: number | null; escrow: string | null; developers: number | null };

const COMMENTS_QUERY = `query BannerComments($issueId: String!) {
  issueComments(issueId: $issueId) { id body createdAt user { id name walletAddress } }
}`;
type Comment = { id: string; body: string; user: { name?: string | null; walletAddress: string } };

const AUTOPLAY_MS = 10_000;
const plain = (md: string) => md.replace(/```[\s\S]*?```/g, "").replace(/!?\[[^\]]*\]\([^)]*\)/g, "").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();

export function HomeBanner({ stats }: { stats: BannerStats }) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useState<TabKey>("trending");
  const [data, setData] = useState<{ top: Bounty[]; closing: Bounty[]; recent: Bounty[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);

  useEffect(() => {
    let active = true;
    queryClient
      .fetchQuery({ queryKey: ["home-banner"], queryFn: () => graphqlRequest<Record<"top" | "closing" | "recent", Pool>>(BANNER_QUERY) })
      .then((r) => active && setData({ top: toBounties(r.top), closing: toBounties(r.closing), recent: toBounties(r.recent) }))
      .catch(() => active && setData({ top: [], closing: [], recent: [] }));
    return () => { active = false; };
  }, [queryClient]);

  const rail = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    switch (tab) {
      case "reward": return data.top.slice(0, 10);
      case "closing": return data.closing.filter((b) => b.expiresAt && new Date(b.expiresAt).getTime() > now).slice(0, 10);
      case "underserved": return data.top.filter((b) => b.applicationCount <= 1).slice(0, 10);
      case "new": return data.recent.slice(0, 10);
      default: {
        const month = data.recent.filter((b) => now - new Date(b.createdAt).getTime() <= 30 * DAY);
        return [...(month.length ? month : data.recent)].sort((a, b) => heat(b) - heat(a)).slice(0, 10);
      }
    }
  }, [data, tab]);

  const n = rail.length;
  const current = n ? rail[index % n] : undefined;
  // Wrap-around: after #10 comes #1, and prev from #1 goes to #10.
  const go = useCallback((delta: number) => setIndex((i) => (n ? (i + delta + n) % n : 0)), [n]);
  const pick = (key: TabKey) => { setTab(key); setIndex(0); };

  // Auto-advance every 10s; the key on `index` restarts the timer after any manual move. Off on hover or reduced motion.
  useEffect(() => {
    if (n < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => go(1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [n, paused, index, tab, go]);

  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    let active = true;
    setComments(null);
    queryClient
      .fetchQuery({ queryKey: ["banner-comments", currentId], queryFn: () => graphqlRequest<{ issueComments: Comment[] }>(COMMENTS_QUERY, { issueId: currentId }), staleTime: 60_000 })
      .then((r) => active && setComments(r.issueComments.slice(-4).reverse()))
      .catch(() => active && setComments([]));
    return () => { active = false; };
  }, [currentId, queryClient]);

  const figs: Array<[string, string | number | null, string?]> = [
    ["Open bounties", stats.open], ["Locked in escrow", stats.escrow, "USDC"], ["Active developers", stats.developers],
  ];
  const left = current ? timeLeft(current.expiresAt) : null;

  return (
    <section className="hero">
      <div className="hb" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
        <div className="hb-stats" aria-label="Marketplace numbers">
          {figs.map(([label, value, unit]) => (
            <div key={label} className="hb-stat">
              <span className="lab">{label}</span>
              <span className="mono v">{value ?? "—"}{value != null && unit ? <small> {unit}</small> : null}</span>
            </div>
          ))}
        </div>

        <div className="hb-bar">
          <div className="seg" role="tablist" aria-label="Featured bounties">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => pick(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="hb-arrows">
            <span className="mono hb-count">{n ? `${(index % n) + 1} / ${n}` : ""}</span>
            <button type="button" aria-label="Previous bounty" onClick={() => go(-1)}><ChevronLeft size={16} /></button>
            <button type="button" aria-label="Next bounty" onClick={() => go(1)}><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="hb-slide" data-testid="banner-slide">
          {!data && <div className="hb-main hb-skel" />}
          {data && !current && <p className="hb-empty">No bounties in this list yet.</p>}
          {current && (
            <>
              <article className="hb-main" key={current.id}>
                <div className="hb-top">
                  <span className="mono rank">#{(index % n) + 1}</span>
                  <span className="badge b-info">{current.category}</span>
                  {left && <span className="mono hb-left">{left}</span>}
                </div>
                <Link href={`/issues/${current.id}`} className="hb-title">{current.title}</Link>
                <p className="hb-desc">{plain(current.description)}</p>
                <div className="hb-reward mono">{current.amount.toLocaleString()} <small>{current.token.symbol}</small></div>
                <div className="hb-meta">
                  <span title="Comments"><MessageSquare size={14} /> {current.commentCount}</span>
                  <span title="Applicants"><Users size={14} /> {current.applicationCount}</span>
                  {current.requiredSkills.slice(0, 3).map((sk) => <span key={sk} className="tag">{sk}</span>)}
                </div>
                <div className="hb-cta">
                  <Link href={`/issues/${current.id}`} className="btn btn-o">View</Link>
                  {current.client.id !== userId && <Link href={`/issues/${current.id}#apply`} className="btn btn-p">Apply</Link>}
                </div>
              </article>

              <aside className="hb-side" aria-label="Discussion">
                <div className="hb-panel">
                  <div className="lab">Discussion</div>
                  {comments === null && <p className="hb-note">Loading…</p>}
                  {comments?.length === 0 && <p className="hb-note">No comments yet. Be the first to ask a question.</p>}
                  {comments?.map((c) => (
                    <Link key={c.id} href={`/issues/${current.id}`} className="hb-comment">
                      <b>{c.user.name || shortenAddress(c.user.walletAddress)}</b>
                      <span>{plain(c.body)}</span>
                    </Link>
                  ))}
                </div>
              </aside>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
