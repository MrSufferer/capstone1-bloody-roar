// apps/web/src/app/marketplace/page.tsx
// Direct URL for the marketplace; the same listing is also the homepage.

import type { Metadata } from "next";
import { MarketplaceView } from "../../components/marketplace/marketplace-view";

export const metadata: Metadata = {
  title: "Bounty Marketplace",
  description:
    "Browse technical bounties to solve. Rewards are locked in an escrow smart contract.",
};

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ skills?: string; search?: string }> }) {
  const params = await searchParams;
  return <MarketplaceView key={JSON.stringify([params.search, params.skills])} initialSearch={params.search || ""} initialSkill={params.skills} />;
}
