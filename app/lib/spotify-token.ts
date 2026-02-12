export const spotifyTokenKey = "chronojam:spotify-access-token";
export const spotifyTokenExpiryKey = "chronojam:spotify-access-token-expiry";

type RefreshPayload = {
  accessToken: string;
  expiresIn: number;
};

export function readStoredSpotifyToken() {
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

  const expiresAt = Date.now() + expiresInSeconds * 1000;
  window.localStorage.setItem(spotifyTokenKey, accessToken);
  window.localStorage.setItem(spotifyTokenExpiryKey, String(expiresAt));
}

export async function refreshSpotifyAccessToken(): Promise<RefreshPayload> {
  const response = await fetch("/auth/spotify/refresh", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Refresh failed (${response.status})`);
  }

  const payload = (await response.json()) as RefreshPayload;
  if (!payload.accessToken || !payload.expiresIn) {
    throw new Error("Invalid refresh response.");
  }

  storeSpotifyToken(payload.accessToken, payload.expiresIn);
  return payload;
}

export function isTokenExpiring(expiresAt: number, thresholdMs = 60_000) {
  return !expiresAt || Date.now() + thresholdMs >= expiresAt;
}

