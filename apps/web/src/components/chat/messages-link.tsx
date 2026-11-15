"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { graphqlRequest } from "@/lib/graphql-client";

export function MessagesLink() {
  const user = useAuthStore((s) => s.user), [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0); if (!user) return;
    let active = true;
    const refresh = () => { void graphqlRequest<{ myUnreadMessageTotal: number }>(`query InboxBadge { myUnreadMessageTotal }`).then((r) => { if (active) setCount(r.myUnreadMessageTotal); }).catch(() => undefined); };
    refresh(); const socket = io({ withCredentials: true }); socket.on("connect", refresh); socket.on("inbox:update", refresh);
    const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); socket.disconnect(); };
  }, [user]);
  return user ? <Link href="/messages" aria-label={count ? `Messages, ${count} unread` : "Messages"}>Messages{count > 0 && <span className="ml-1 rounded-full bg-[var(--brand)] px-1.5 text-xs text-white">{count}</span>}</Link> : null;
}
