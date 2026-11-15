/* eslint-disable @next/next/no-img-element */
// Round avatar with an initial as fallback; shared by the public profile and global search.
export function Avatar({ user, size = 32 }: { user: { name?: string | null; avatar?: string | null; walletAddress?: string }; size?: number }) {
  const initial = (user.name || user.walletAddress?.slice(2) || "?").charAt(0).toUpperCase();
  return (
    <span className="shrink-0 grid place-items-center rounded-full overflow-hidden bg-[var(--brand)] text-[var(--cta-ink)] font-bold" style={{ width: size, height: size, fontSize: size / 2.4 }}>
      {user.avatar ? <img src={user.avatar} alt="" width={size} height={size} className="h-full w-full object-cover" /> : initial}
    </span>
  );
}
