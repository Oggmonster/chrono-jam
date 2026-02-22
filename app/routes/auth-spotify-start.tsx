import { redirect } from "react-router";
import type { Route } from "./+types/auth-spotify-start";

import {
  buildStateCookie,
  clearStateCookie,
  getSpotifyClientId,
  getSpotifyRedirectUri,
  getSpotifyScopeParam,
  randomState,
  spotifyHostRoomCookieName,
  spotifyStateCookieName,
} from "~/lib/spotify-oauth.server";

export async function loader({ request }: Route.LoaderArgs) {
  let clientId: string;

  try {
    clientId = getSpotifyClientId();
  } catch {
    const requestUrl = new URL(request.url);
    const room = requestUrl.searchParams.get("room") ?? "";
    const fallbackTarget = room ? `/host/lobby/${encodeURIComponent(room)}` : "/host/lobby";
    return redirect(`${fallbackTarget}?spotify_error=Missing%20SPOTIFY_CLIENT_ID`);
  }

  const requestUrl = new URL(request.url);
  const room = requestUrl.searchParams.get("room") ?? "";
  const playlists = requestUrl.searchParams.get("playlists") ?? "";
  const songs = requestUrl.searchParams.get("songs") ?? "";
  const state = randomState();
  const redirectUri = getSpotifyRedirectUri(request);

  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", getSpotifyScopeParam());
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  if (room) {
    authorizeUrl.searchParams.set("room", room);
  }
  if (playlists) {
    authorizeUrl.searchParams.set("playlists", playlists);
  }
  if (songs) {
    authorizeUrl.searchParams.set("songs", songs);
  }

  const headers = new Headers();
  headers.append("Set-Cookie", buildStateCookie(spotifyStateCookieName, state, request));
  if (room) {
    headers.append("Set-Cookie", buildStateCookie(spotifyHostRoomCookieName, encodeURIComponent(room), request));
  } else {
    headers.append("Set-Cookie", clearStateCookie(spotifyHostRoomCookieName, request));
  }

  return redirect(authorizeUrl.toString(), { headers });
}

export default function AuthSpotifyStart() {
  return null;
}
