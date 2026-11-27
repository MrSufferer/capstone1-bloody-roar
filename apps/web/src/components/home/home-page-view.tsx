"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { IssueCard, type IssueItem } from "@/components/marketplace/issue-card";
import { WolfLogo } from "@/components/ui/wolf-logo";
import { HomeBanner } from "./home-banner";
import { useUiPreferences } from "@/lib/ui-preferences";

const ISSUES_QUERY = `
  query HomeIssues($first: Int!) {
    issues(first: $first, sortBy: CREATED_AT, sortOrder: DESC) {
      edges { node {
        id title description category status bountyAmount { formatted } requiredSkills difficulty
        timeEstimate expiresAt viewCount applicationCount createdAt
        token { symbol name logoUrl }
        client { id name avatar walletAddress reputationScore isGithubVerified }
      } }
    }
  }
`;

const STATS_QUERY = `
  query HomeStats {
    marketplaceStats { openBounties bountyPool { symbol formatted } activeHunters }
  }
`;

type IssuesResponse = {
  issues: {
    edges: Array<{ node: Omit<IssueItem, "bountyAmount"> & { bountyAmount: { formatted: string } } }>;
  };
};

type StatsResponse = {
  marketplaceStats: {
    openBounties: number;
    bountyPool: Array<{ symbol: string; formatted: string }>;
    activeHunters: number;
  };
};

export function HomePageView() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const { theme, t } = useUiPreferences();

  const [activeSort, setActiveSort] = useState<"HOT" | "CLOSING" | "HIGHEST" | "NEWEST">("HOT");
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [openBountiesCount, setOpenBountiesCount] = useState<number | null>(null);
  const [escrowTotal, setEscrowTotal] = useState<string | null>(null);
  const [activeDevelopers, setActiveDevelopers] = useState<number | null>(null);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN") {
      router.replace("/admin");
    }
  }, [router, status, user?.role]);

  useEffect(() => {
    let active = true;
    queryClient.fetchQuery({ queryKey: ["home-issues"], queryFn: () => graphqlRequest<IssuesResponse>(ISSUES_QUERY, { first: 6 }) })
      .then((res) => {
        if (!active) return;
        const edges = res?.issues?.edges ?? [];
        setIssues(edges.map((e) => ({ ...e.node, bountyAmount: Number(e.node.bountyAmount.formatted) })));
      })
      .catch(() => {
        if (!active) return;
        setIssues([]);
      });

    queryClient.fetchQuery({ queryKey: ["marketplace-stats"], queryFn: () => graphqlRequest<StatsResponse>(STATS_QUERY) })
      .then((res) => {
        if (!active || !res?.marketplaceStats) return;
        const stats = res.marketplaceStats;
        setOpenBountiesCount(stats.openBounties ?? 0);
        setActiveDevelopers(stats.activeHunters ?? 0);
        const usdcPool = stats.bountyPool?.find((p) => p.symbol.toUpperCase() === "USDC");
        setEscrowTotal(usdcPool ? Number(usdcPool.formatted).toLocaleString() : "0");
      })
      .catch(() => {
        if (!active) return;
        setOpenBountiesCount(null);
        setActiveDevelopers(null);
        setEscrowTotal(null);
      });

    return () => {
      active = false;
    };
  }, [queryClient]);

  const sortedIssues = [...issues].sort((a, b) => {
    if (activeSort === "HIGHEST") return b.bountyAmount - a.bountyAmount;
    if (activeSort === "CLOSING") {
      const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    }
    if (activeSort === "HOT") return b.viewCount - a.viewCount;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className={`br ${theme === "dark" ? "dark" : ""}`}>
      <HomeBanner stats={{ open: openBountiesCount, escrow: escrowTotal, developers: activeDevelopers }} />

      {/* Main Content Grid */}
      <div className="wrap">
        <main className="content" style={{ flexBasis: "100%" }}>
          <div className="cols">
            {/* Left Column: Top Bounties */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <div className="ph" style={{ alignItems: "center" }}>
                <h2 className="h1" style={{ fontSize: 22 }}>Top bounties</h2>
                <div className="seg" role="group" aria-label="Sort">
                  <button
                    type="button"
                    className={activeSort === "HOT" ? "on" : ""}
                    onClick={() => setActiveSort("HOT")}
                  >
                    Hot
                  </button>
                  <button
                    type="button"
                    className={activeSort === "CLOSING" ? "on" : ""}
                    onClick={() => setActiveSort("CLOSING")}
                  >
                    Closing soon
                  </button>
                  <button
                    type="button"
                    className={activeSort === "HIGHEST" ? "on" : ""}
                    onClick={() => setActiveSort("HIGHEST")}
                  >
                    Highest reward
                  </button>
                  <button
                    type="button"
                    className={activeSort === "NEWEST" ? "on" : ""}
                    onClick={() => setActiveSort("NEWEST")}
                  >
                    Newest
                  </button>
                </div>
              </div>

              <div className="list">
                {sortedIssues.length > 0 ? (
                  sortedIssues.slice(0, 5).map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))
                ) : (
                  <p style={{ color: "var(--ink-3)", fontSize: 14, margin: "16px 0" }}>{t("noIssuesYet")}</p>
                )}
              </div>

              <Link href="/marketplace" style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--link)" }}>
                Browse all {openBountiesCount ?? "—"} bounties <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>
            </div>

            {/* Right Column: Information Panels */}
            <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* How a bounty moves */}
              <section className="panel note">
                <div className="panel-h">How a bounty moves</div>
                <div className="panel-b">
                  <ol className="steps">
                    <li><b>Post.</b> Scope, acceptance criteria, reward and deadline. Posting is free.</li>
                    <li><b>Apply and select.</b> The client picks one developer and has 24 h to fund.</li>
                    <li><b>Fund.</b> USDC moves from the client&apos;s wallet into the contract.</li>
                    <li><b>Deliver and release.</b> The client releases, or the developer claims after a 7-day review timeout.</li>
                  </ol>
                </div>
              </section>

              {/* Recent payouts */}
              <section className="panel">
                <div className="panel-h">Recent payouts</div>
                <div className="panel-b">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      <span className="badge b-open">Released</span>{" "}
                      <span className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>BR-0991</span>
                    </span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>1,218.75</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      <span className="badge b-attn">Settled 80/20</span>{" "}
                      <span className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>BR-0931</span>
                    </span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>585.00</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      <span className="badge b-mut">Refunded</span>{" "}
                      <span className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>BR-0975</span>
                    </span>
                    <span className="mono" style={{ color: "var(--ink-2)", fontWeight: 600 }}>400.00</span>
                  </div>
                </div>
              </section>

              {/* Top developers */}
              <section className="panel">
                <div className="panel-h">Top developers this month</div>
                <div className="panel-b">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ color: "var(--ink-3)", width: 14 }}>1</span>
                    <span className="av av2">MN</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>Minh Nguyen</span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>4,210</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ color: "var(--ink-3)", width: 14 }}>2</span>
                    <span className="av av3">QL</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>Quang Le</span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>3,075</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ color: "var(--ink-3)", width: 14 }}>3</span>
                    <span className="av av4">TV</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>Thao Vu</span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>1,940</span>
                  </div>
                </div>
              </section>
            </aside>
          </div>


        </main>
      </div>

      {/* Footer */}
      <footer className="foot">
        <div className="foot-in">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="logo" style={{ color: "var(--ink)" }}>
              <WolfLogo size={36} />
              <span className="font-bold tracking-tight text-lg">Bloody-Roar</span>
            </span>
            <span style={{ color: "var(--ink-3)" }}>Bounty marketplace with on-chain USDC escrow.</span>
          </div>
          <nav aria-label="Marketplace">
            <span className="lab">Marketplace</span>
            <Link href="/marketplace">Browse bounties</Link>
            <Link href="/marketplace?skills=solidity">Skills</Link>
            <Link href="/marketplace">Developers</Link>
            <Link href="/issues/create">Post a bounty</Link>
          </nav>
          <nav aria-label="Escrow">
            <span className="lab">Escrow</span>
            <Link href="/guide">How it works</Link>
            <Link href="/guide#rules">Contract rules</Link>
            <Link href="/guide#disputes">Disputes and arbiter</Link>
          </nav>
          <nav aria-label="Project">
            <span className="lab">Project</span>
            <a href="https://github.com/hadv/capstone1" target="_blank" rel="noreferrer">GitHub</a>
            <Link href="/api/health">System Status</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
