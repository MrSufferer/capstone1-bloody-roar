"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToastStore } from "@/lib/toast";

const ICON = { success: CheckCircle2, error: AlertCircle, info: Info };

// Top-right stack; sits above the sticky header and never shifts page layout.
export function Toaster() {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);
  return (
    <div className="tst-wrap" aria-live="polite" aria-atomic="false">
      {items.map((item) => {
        const Icon = ICON[item.kind];
        return (
          <div key={item.id} role={item.kind === "error" ? "alert" : "status"} className={`tst tst-${item.kind}`}>
            <Icon className="tst-ico" aria-hidden />
            <p>{item.message}</p>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(item.id)}><X /></button>
          </div>
        );
      })}
    </div>
  );
}
