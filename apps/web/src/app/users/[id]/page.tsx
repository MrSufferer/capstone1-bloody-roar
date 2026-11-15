import { PublicProfileView } from "@/components/profile/public-profile-view";

export default function UserPage({ params }: { params: { id: string } }) {
  return <PublicProfileView userId={params.id} />;
}
