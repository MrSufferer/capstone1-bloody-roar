import { useCallback, useState } from "react";
import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";
export type ToastItem = { id: number; kind: ToastKind; message: string };

let nextId = 1;
export const useToastStore = create<{ items: ToastItem[]; dismiss: (id: number) => void }>((set) => ({
  items: [],
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));

// Callable from anywhere (components, handlers, stores). Identical messages already on screen are not stacked.
const push = (kind: ToastKind, message: string) => {
  const { items, dismiss } = useToastStore.getState();
  if (items.some((item) => item.kind === kind && item.message === message)) return;
  const id = nextId++;
  useToastStore.setState({ items: [...items.slice(-3), { id, kind, message }] });
  setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
};

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
};

// Drop-in for `useState<string | null>(null)`: the value is kept as before, and every non-null set also raises a toast.
export function useToastState(kind: ToastKind) {
  const [value, setValue] = useState<string | null>(null);
  const set = useCallback((message: string | null) => { setValue(message); if (message) toast[kind](message); }, [kind]);
  return [value, set] as const;
}
