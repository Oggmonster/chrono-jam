import {
  buildRefreshCookie,
  clearRefreshCookie,
  getSpotifyClientId,
  getSpotifyClientSecret,
  parseCookieValue,
  spotifyRefreshCookieName,
} from "~/lib/spotify-oauth.server";

type RefreshResponse = {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
};

export type SpotifyRefreshResult =
  | {
      ok: true;
      accessToken: string;
      expiresIn: number;
      scope: string;
      tokenType: string;
      setCookie: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      setCookie: string | null;
    };

export async function refreshSpotifyAccessTokenFromCookie(request: Request): Promise<SpotifyRefreshResult> {
  const encodedRefreshToken = parseCookieValue(request.headers.get("Cookie"), spotifyRefreshCookieName);
  if (!encodedRefreshToken) {
    return { ok: false, status: 401, error: "No refresh token cookie found.", setCookie: null };
  }

  let refreshToken = "";
  try {
    refreshToken = decodeURIComponent(encodedRefreshToken);
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Malformed refresh token cookie.",
      setCookie: clearRefreshCookie(request),
    };
  }

  let clientId: string;
  let clientSecret: string;

  try {
    clientId = getSpotifyClientId();
    clientSecret = getSpotifyClientSecret();
  } catch {
    return { ok: false, status: 500, error: "Missing Spotify OAuth environment variables.", setCookie: null };
  }

  const basicToken = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicToken}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    return {
      ok: false,
      status: 401,
      error: `Spotify refresh failed (${response.status}).`,
      setCookie: clearRefreshCookie(request),
    };
  }

  const tokenData = (await response.json()) as RefreshResponse;
  if (!tokenData.access_token || !tokenData.expires_in) {
    return {
      ok: false,
      status: 502,
      error: "Spotify refresh response was missing token fields.",
      setCookie: null,
    };
  }

  return {
    ok: true,
    accessToken: tokenData.access_token,
    expiresIn: tokenData.expires_in,
    scope: tokenData.scope ?? "",
    tokenType: tokenData.token_type ?? "Bearer",
    setCookie: tokenData.refresh_token ? buildRefreshCookie(tokenData.refresh_token, request) : null,
  };
}

