import type { Route } from "./+types/auth-spotify-token";

import {
  clearCachedSpotifyAccessToken,
  isSpotifyAccessTokenExpiring,
  readCachedSpotifyAccessToken,
  secondsUntilTokenExpiry,
  storeCachedSpotifyAccessToken,
} from "~/lib/spotify-access-token-cache.server";
import { getSpotifySession } from "~/lib/spotify-oauth.server";
import { refreshSpotifyAccessTokenFromCookie } from "~/lib/spotify-refresh.server";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export async function loader({ request }: Route.LoaderArgs) {
  const { sessionId, setCookie: sessionCookie } = getSpotifySession(request);
  const headers = new Headers();
  if (sessionCookie) {
    headers.append("Set-Cookie", sessionCookie);
  }

  const cached = readCachedSpotifyAccessToken(sessionId);
  if (cached && !isSpotifyAccessTokenExpiring(cached.expiresAt, 60_000)) {
    return jsonResponse(
      {
        accessToken: cached.accessToken,
        expiresIn: secondsUntilTokenExpiry(cached.expiresAt),
        scope: cached.scope,
        tokenType: cached.tokenType,
        source: "cache",
      },
      { headers },
    );
  }

  const refreshed = await refreshSpotifyAccessTokenFromCookie(request);
  if (!refreshed.ok) {
    if (refreshed.setCookie) {
      headers.append("Set-Cookie", refreshed.setCookie);
    }

    if (cached && cached.expiresAt > Date.now()) {
      return jsonResponse(
        {
          accessToken: cached.accessToken,
          expiresIn: secondsUntilTokenExpiry(cached.expiresAt),
          scope: cached.scope,
          tokenType: cached.tokenType,
          source: "cache-stale",
        },
        { headers },
      );
    }

    clearCachedSpotifyAccessToken(sessionId);
    return jsonResponse({ error: refreshed.error }, { status: refreshed.status, headers });
  }

  const next = storeCachedSpotifyAccessToken(sessionId, {
    accessToken: refreshed.accessToken,
    expiresIn: refreshed.expiresIn,
    scope: refreshed.scope,
    tokenType: refreshed.tokenType,
  });

  if (refreshed.setCookie) {
    headers.append("Set-Cookie", refreshed.setCookie);
  }

  return jsonResponse(
    {
      accessToken: next.accessToken,
      expiresIn: secondsUntilTokenExpiry(next.expiresAt),
      scope: next.scope,
      tokenType: next.tokenType,
      source: "refresh",
    },
    { headers },
  );
}

export default function AuthSpotifyToken() {
  return null;
}

