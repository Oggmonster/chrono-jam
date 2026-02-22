export const spotifyTokenKey = "chronojam:spotify-access-token";
export const spotifyTokenExpiryKey = "chronojam:spotify-access-token-expiry";

export type StoredSpotifyToken = {
  accessToken: string;
  expiresAt: number;
};

export function readStoredSpotifyToken(): StoredSpotifyToken {
  if (typeof window === "undefined") {
    return { accessToken: "", expiresAt: 0 };
  }

  const accessToken = window.localStorage.getItem(spotifyTokenKey) ?? "";
  const expiresAt = Number(window.localStorage.getItem(spotifyTokenExpiryKey) ?? "0");
  return { accessToken, expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0 };
}

export function storeSpotifyToken(accessToken: string, expiresInSeconds: number) {
  if (typeof window === "undefined") {
    return;
  }

  const trimmedToken = accessToken.trim();
  const safeExpiresIn = Math.max(1, Math.floor(expiresInSeconds));
  if (!trimmedToken) {
    clearStoredSpotifyToken();
    return;
  }

  const expiresAt = Date.now() + safeExpiresIn * 1000;
  window.localStorage.setItem(spotifyTokenKey, trimmedToken);
  window.localStorage.setItem(spotifyTokenExpiryKey, String(expiresAt));
}

export function clearStoredSpotifyToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(spotifyTokenKey);
  window.localStorage.removeItem(spotifyTokenExpiryKey);
}

export function isTokenExpiring(expiresAt: number, thresholdMs = 60_000) {
  return !expiresAt || Date.now() + thresholdMs >= expiresAt;
}

export function getStoredSpotifyTokenStatus(thresholdMs = 60_000) {
  const stored = readStoredSpotifyToken();
  const now = Date.now();
  const remainingMs = Math.max(0, stored.expiresAt - now);
  const missing = !stored.accessToken;
  const expired = !missing && stored.expiresAt <= now;
  const expiring = !missing && isTokenExpiring(stored.expiresAt, thresholdMs);
  const usable = !missing && !expiring;

  return {
    ...stored,
    remainingMs,
    missing,
    expired,
    expiring,
    usable,
  };
}
