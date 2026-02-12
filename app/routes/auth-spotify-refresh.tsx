import type { Route } from "./+types/auth-spotify-refresh";

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

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export async function loader({ request }: Route.LoaderArgs) {
  const encodedRefreshToken = parseCookieValue(request.headers.get("Cookie"), spotifyRefreshCookieName);
  if (!encodedRefreshToken) {
    return jsonResponse({ error: "No refresh token cookie found." }, { status: 401 });
  }

  const refreshToken = decodeURIComponent(encodedRefreshToken);

  let clientId: string;
  let clientSecret: string;

  try {
    clientId = getSpotifyClientId();
    clientSecret = getSpotifyClientSecret();
  } catch {
    return jsonResponse({ error: "Missing Spotify OAuth environment variables." }, { status: 500 });
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
    const headers = new Headers();
    headers.append("Set-Cookie", clearRefreshCookie(request));
    return jsonResponse({ error: `Spotify refresh failed (${response.status}).` }, { status: 401, headers });
  }

  const tokenData = (await response.json()) as RefreshResponse;
  const headers = new Headers();

  if (tokenData.refresh_token) {
    headers.append("Set-Cookie", buildRefreshCookie(tokenData.refresh_token, request));
  }

  return jsonResponse(
    {
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope ?? "",
      tokenType: tokenData.token_type,
    },
    { headers },
  );
}

export default function AuthSpotifyRefresh() {
  return null;
}
