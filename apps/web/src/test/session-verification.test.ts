import { describe, expect, it, vi } from "vitest";

const { authenticate, findSession } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  findSession: vi.fn(),
}));
vi.mock("@thirdweb-dev/auth", () => ({ ThirdwebAuth: class { authenticate = authenticate; } }));
vi.mock("@thirdweb-dev/wallets", () => ({ PrivateKeyWallet: class {} }));
vi.mock("@bloody-roar/database", () => ({ prisma: { session: { findUnique: findSession } } }));
vi.stubEnv("AUTH_PRIVATE_KEY", "test");

describe("session verification", () => {
  it("propagates database failures instead of treating the token as invalid", async () => {
    authenticate.mockResolvedValue({ address: "0x123" });
    findSession.mockRejectedValue(new Error("database unavailable"));
    const { verifySessionJWT, verifyJWT } = await import("@/lib/auth");
    await expect(verifySessionJWT("token")).rejects.toThrow("database unavailable");
    await expect(verifyJWT("token")).resolves.toBeNull();
  });

  it("shares one lookup per token until the cache is cleared or expires", async () => {
    const { verifySessionJWT, clearAuthCache } = await import("@/lib/auth");
    clearAuthCache();
    findSession.mockReset();
    authenticate.mockResolvedValue({ address: "0xABC" });
    findSession.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "u1", walletAddress: "0xabc", isBanned: false },
    });
    await verifySessionJWT("cached");
    await verifySessionJWT("cached");
    expect(findSession).toHaveBeenCalledTimes(1);
    clearAuthCache();
    await verifySessionJWT("cached");
    expect(findSession).toHaveBeenCalledTimes(2);
  });

  it("rejects revoked, banned and wallet-mismatched sessions", async () => {
    const { verifySessionJWT, clearAuthCache } = await import("@/lib/auth");
    const live = { revokedAt: null, expiresAt: new Date(Date.now() + 60_000) };
    authenticate.mockResolvedValue({ address: "0xABC" });
    const cases = [
      { ...live, revokedAt: new Date(), user: { walletAddress: "0xabc", isBanned: false } },
      { ...live, user: { walletAddress: "0xabc", isBanned: true } },
      { ...live, user: { walletAddress: "0xdef", isBanned: false } },
    ];
    for (const session of cases) {
      clearAuthCache();
      findSession.mockResolvedValueOnce(session);
      await expect(verifySessionJWT("t")).resolves.toBeNull();
    }
  });
});
