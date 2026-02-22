import { redirect } from "react-router";
import type { Route } from "./+types/auth-spotify-callback";

import {
  clearStateCookie,
  getSpotifyClientId,
  getSpotifyClientSecret,
  getSpotifyRedirectUri,
  parseCookieValue,
  spotifyHostRoomCookieName,
  spotifyStateCookieName,
} from "~/lib/spotify-oauth.server";
import { normalizeRoomCode } from "~/lib/room-code";

type TokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

function decodeCookieValue(value: string | null) {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function redirectWithError(request: Request, message: string) {
  const callbackUrl = new URL(request.url);
  const roomFromQuery = normalizeRoomCode(callbackUrl.searchParams.get("room") ?? "");
  const roomFromCookie = normalizeRoomCode(
    decodeCookieValue(parseCookieValue(request.headers.get("Cookie"), spotifyHostRoomCookieName)),
  );
  const room = roomFromQuery || roomFromCookie;
  const targetPath = room ? `/host/lobby/${room}` : "/host/lobby";
  const url = new URL(targetPath, request.url);
  url.searchParams.set("spotify_error", message);
  return redirect(url.toString());
}

export async function loader({ request }: Route.LoaderArgs) {
  const callbackUrl = new URL(request.url);

  const error = callbackUrl.searchParams.get("error");
  if (error) {
    return redirectWithError(request, error);
  }

  const state = callbackUrl.searchParams.get("state");
  const code = callbackUrl.searchParams.get("code");
  const room = callbackUrl.searchParams.get("room");
  const playlists = callbackUrl.searchParams.get("playlists");
  const songs = callbackUrl.searchParams.get("songs");

  const expectedState = parseCookieValue(request.headers.get("Cookie"), spotifyStateCookieName);
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(request, "Invalid OAuth state");
  }

  let clientId: string;
  let clientSecret: string;
  let redirectUri: string;

  try {
    clientId = getSpotifyClientId();
    clientSecret = getSpotifyClientSecret();
    redirectUri = getSpotifyRedirectUri(request);
  } catch {
    return redirectWithError(request, "Missing Spotify OAuth environment variables");
  }

  const basicToken = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
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
    const errorText = await response.text();
    return redirectWithError(request, `Token exchange failed (${response.status}): ${errorText.slice(0, 120)}`);
  }

  const tokenData = (await response.json()) as TokenResponse;
  const roomFromQuery = normalizeRoomCode(room ?? "");
  const roomFromCookie = normalizeRoomCode(
    decodeCookieValue(parseCookieValue(request.headers.get("Cookie"), spotifyHostRoomCookieName)),
  );
  const normalizedRoom = roomFromQuery || roomFromCookie;
  const target = new URL(
    normalizedRoom ? `/host/lobby/${normalizedRoom}` : "/host/lobby",
    request.url,
  );
  target.searchParams.set("spotify_access_token", tokenData.access_token);
  target.searchParams.set("spotify_expires_in", String(tokenData.expires_in));
  target.searchParams.set("spotify_scope", tokenData.scope);
  if (playlists) {
    target.searchParams.set("playlists", playlists);
  }
  if (songs) {
    target.searchParams.set("songs", songs);
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearStateCookie(spotifyStateCookieName, request));
  headers.append("Set-Cookie", clearStateCookie(spotifyHostRoomCookieName, request));

  return redirect(target.toString(), {
    headers,
  });
}

export default function AuthSpotifyCallback() {
  return null;
}
