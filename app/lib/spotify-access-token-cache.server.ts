type CachedSpotifyAccessToken = {
  accessToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
  updatedAt: number;
};

type SpotifyAccessTokenCache = Map<string, CachedSpotifyAccessToken>;

declare global {
  var __chronojamSpotifyAccessTokenCache: SpotifyAccessTokenCache | undefined;
}

function tokenCache(): SpotifyAccessTokenCache {
  if (!globalThis.__chronojamSpotifyAccessTokenCache) {
    globalThis.__chronojamSpotifyAccessTokenCache = new Map<string, CachedSpotifyAccessToken>();
  }

  return globalThis.__chronojamSpotifyAccessTokenCache;
}

function pruneExpiredEntries(now = Date.now()) {
  const cache = tokenCache();
  for (const [sessionId, entry] of cache.entries()) {
    if (entry.expiresAt <= now - 60_000) {
      cache.delete(sessionId);
    }
  }
}

export function readCachedSpotifyAccessToken(sessionId: string) {
  pruneExpiredEntries();
  return tokenCache().get(sessionId) ?? null;
}

export function storeCachedSpotifyAccessToken(
  sessionId: string,
  payload: {
    accessToken: string;
    expiresIn: number;
    scope?: string;
    tokenType?: string;
  },
) {
  const expiresInSeconds = Math.max(1, Math.floor(payload.expiresIn));
  const now = Date.now();
  const entry: CachedSpotifyAccessToken = {
    accessToken: payload.accessToken,
    expiresAt: now + expiresInSeconds * 1000,
    scope: payload.scope ?? "",
    tokenType: payload.tokenType ?? "Bearer",
    updatedAt: now,
  };

  tokenCache().set(sessionId, entry);
  return entry;
}

export function clearCachedSpotifyAccessToken(sessionId: string) {
  tokenCache().delete(sessionId);
}

export function isSpotifyAccessTokenExpiring(expiresAt: number, thresholdMs = 60_000) {
  return !expiresAt || Date.now() + thresholdMs >= expiresAt;
}

export function secondsUntilTokenExpiry(expiresAt: number) {
  return Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
}

