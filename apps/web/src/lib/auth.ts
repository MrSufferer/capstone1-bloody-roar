import { ThirdwebAuth } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { prisma } from "@bloody-roar/database";
import { createLogger } from "./logger";
import * as crypto from "crypto";

const log = createLogger("auth");

export const AUTH_COOKIE_NAME = "bloody_token";

export function tokenFromCookieHeader(cookieHeader: string | null): string | null {
  const cookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(AUTH_COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

export function tokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  return tokenFromCookieHeader(request.headers.get("cookie"));
}

export function toPublicAuthUser(user: Awaited<ReturnType<typeof verifyJWT>>) {
  if (!user) return null;
  return {
    id: user.id,
    walletAddress: user.walletAddress,
    role: user.role,
    name: user.name,
    avatar: user.avatar,
    bio: user.bio,
    skills: user.skills,
    location: user.location,
    reputationScore: user.reputationScore,
    completedTaskCount: user.completedTaskCount,
    isGithubVerified: user.isGithubVerified,
    createdAt: user.createdAt,
  };
}

// Fail gracefully instead of crashing the entire server on import
const AUTH_PRIVATE_KEY = process.env.AUTH_PRIVATE_KEY;
if (!AUTH_PRIVATE_KEY) {
  log.warn("AUTH_PRIVATE_KEY is not set — auth endpoints will be unavailable");
}

/**
 * Thirdweb Auth singleton.
 * Lazy-initialized to avoid crashing the server if AUTH_PRIVATE_KEY is missing.
 */
function getThirdwebAuth(): ThirdwebAuth {
  if (!AUTH_PRIVATE_KEY) {
    throw new Error("AUTH_PRIVATE_KEY is not configured");
  }
  return new ThirdwebAuth(
    new PrivateKeyWallet(AUTH_PRIVATE_KEY),
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ?? "localhost:4000",
  );
}

// Singleton instance (created on first use)
let _thirdwebAuth: ThirdwebAuth | null = null;

export function thirdwebAuth(): ThirdwebAuth {
  if (!_thirdwebAuth) {
    _thirdwebAuth = getThirdwebAuth();
  }
  return _thirdwebAuth;
}

/**
 * Verify a JWT and map to DB User.
 *
 * Uses `authenticate` to verify the signature, and then checks the
 * DB for revocation using the `refreshHash` of the token.
 */
export async function verifyJWT(token: string) {
  return verifySessionJWT(token).catch(() => null);
}

// Session restoration must distinguish an unavailable database from an invalid token.
// A page load fires several requests with the same token; share one lookup for a moment.
// shortcut: per-process cache, cleared on logout and every GraphQL mutation; use Redis if scaled out.
const AUTH_CACHE_MS = 2000;
const authCache = new Map<string, { at: number; result: ReturnType<typeof loadSession> }>();

export function clearAuthCache() {
  authCache.clear();
}

export function verifySessionJWT(token: string) {
  const hit = authCache.get(token);
  if (hit && Date.now() - hit.at < AUTH_CACHE_MS) return hit.result;
  const result = loadSession(token);
  authCache.set(token, { at: Date.now(), result });
  result.catch(() => authCache.delete(token));
  // Forget the entry once it expires, so random tokens cannot grow the map.
  setTimeout(() => authCache.delete(token), AUTH_CACHE_MS).unref();
  return result;
}

async function loadSession(token: string) {
  const auth = thirdwebAuth();
  let authUser: Awaited<ReturnType<typeof auth.authenticate>>;
  try {
    authUser = await auth.authenticate(token);
  } catch {
    return null;
  }
  if (!authUser?.address) return null;

  // Check if session is revoked via refreshHash; one joined query instead of two round trips.
  const refreshHash = crypto.createHash("sha256").update(token).digest("hex");
  const session = await prisma.session.findUnique({
    where: { refreshHash },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;

  const user = session.user;
  if (user.walletAddress !== authUser.address.toLowerCase() || user.isBanned) return null;
  return user;
}
