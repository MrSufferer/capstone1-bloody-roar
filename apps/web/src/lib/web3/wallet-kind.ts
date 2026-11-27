type WalletKind = "in-app" | "injected";
const WALLET_KIND_KEY = "bloody-roar-wallet-kind";

export function getWalletKind(): WalletKind | null {
  try {
    const kind = window.localStorage.getItem(WALLET_KIND_KEY);
    return kind === "in-app" || kind === "injected" ? kind : null;
  } catch {
    return null;
  }
}

export function setWalletKind(kind: WalletKind | null): void {
  try {
    if (kind) window.localStorage.setItem(WALLET_KIND_KEY, kind);
    else window.localStorage.removeItem(WALLET_KIND_KEY);
  } catch {
  }
}
