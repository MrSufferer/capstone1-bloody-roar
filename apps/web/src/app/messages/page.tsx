import { Suspense } from "react";
import { InboxView } from "@/components/chat/inbox-view";
export default function MessagesPage() { return <Suspense fallback={<p>Loading messages…</p>}><InboxView /></Suspense>; }
