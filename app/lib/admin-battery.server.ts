import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CatalogEntry } from "~/lib/gamepack";
import {
  getSpotifyClientId,
  getSpotifyClientSecret,
  parseCookieValue,
  spotifyRefreshCookieName,
} from "~/lib/spotify-oauth.server";

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type SpotifyPlaylistMetaResponse = {
  id: string;
  name: string;
  owner?: {
    id?: string;
    display_name?: string;
  };
};

type SpotifyPlaylistTracksResponse = {
  items: Array<{
    item?: {
      id: string | null;
      name: string;
      type: string;
      is_local?: boolean;
      artists?: Array<{ id: string | null; name: string }>;
      album?: {
        release_date?: string;
      };
    } | null;
    track?: {
      id: string | null;
      name: string;
      type: string;
      is_local: boolean;
      artists: Array<{ id: string | null; name: string }>;
      album?: {
        release_date?: string;
      };
    } | null;
  }>;
  next: string | null;
};

type BaseBatteryAsset = {
  kind: "base-battery";
  version: number;
  tracks: CatalogEntry[];
  artists: CatalogEntry[];
};

type BaseBatteryVersionAsset = {
  kind: "base-battery-version";
  version: number;
};

export type GenerateBaseBatteryResult = {
  version: number;
  fileName: string;
  playlistId: string;
  playlistName: string;
  trackCount: number;
  artistCount: number;
};

type TokenCandidate = {
  token: string;
  source: "user" | "browser";
};

type SpotifyUserProfile = {
  id: string;
  display_name?: string;
};

function parseSpotifyPlaylistId(rawValue: string) {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  if (/^[A-Za-z0-9]{22}$/.test(value)) {
    return value;
  }

  if (value.startsWith("spotify:playlist:")) {
    const id = value.slice("spotify:playlist:".length).trim();
    return /^[A-Za-z0-9]{22}$/.test(id) ? id : null;
  }

  try {
    const parsedUrl = new URL(value);
    if (!parsedUrl.hostname.includes("spotify.com")) {
      return null;
    }

    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const playlistIndex = segments.findIndex((segment) => segment === "playlist");
    if (playlistIndex < 0) {
      return null;
    }

    const id = segments[playlistIndex + 1] ?? "";
    return /^[A-Za-z0-9]{22}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function fetchSpotifyToken(grantType: "client_credentials" | "refresh_token", refreshToken?: string) {
  const clientId = getSpotifyClientId();
  const clientSecret = getSpotifyClientSecret();
  const basicToken = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams();
  body.set("grant_type", grantType);
  if (grantType === "refresh_token") {
    if (!refreshToken) {
      throw new Error("Missing refresh token.");
    }
    body.set("refresh_token", refreshToken);
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicToken}`,
    },
    body: body.toString(),
  });

  const tokenPayload = (await response.json()) as SpotifyTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    const details = tokenPayload.error_description ?? tokenPayload.error ?? "";
    throw new Error(`Spotify token request failed (${response.status})${details ? `: ${details}` : ""}.`);
  }

  if (!tokenPayload.access_token) {
    throw new Error("Spotify token response missing access token.");
  }

  return tokenPayload.access_token;
}

async function parseSpotifyApiError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string } | string;
    };

    if (typeof payload.error === "string") {
      return payload.error;
    }

    if (payload.error && typeof payload.error.message === "string") {
      return payload.error.message;
    }
  } catch {
    // Ignore parse failures.
  }

  return "";
}

async function spotifyGetWithCandidates(url: string, candidates: TokenCandidate[]) {
  let lastStatus = 0;
  let lastMessage = "";
  let sawUserToken = false;
  const attemptSummaries: string[] = [];

  for (const candidate of candidates) {
    if (candidate.source === "user") {
      sawUserToken = true;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${candidate.token}`,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return response;
    }

    const errorMessage = await parseSpotifyApiError(response);
    lastStatus = response.status;
    lastMessage = errorMessage;
    attemptSummaries.push(
      `${candidate.source}:${response.status}${errorMessage ? ` (${errorMessage})` : ""}`,
    );

    if (response.status === 401 || response.status === 403) {
      continue;
    }

    throw new Error(`Spotify request failed (${response.status})${errorMessage ? `: ${errorMessage}` : ""}.`);
  }

  if (!sawUserToken) {
    throw new Error(
      `Spotify playlist access denied (${lastStatus || 403})${lastMessage ? `: ${lastMessage}` : ""}. ` +
        "If the playlist is private/collaborative, connect Spotify in host setup first. " +
        `Attempts: ${attemptSummaries.join(", ")}.`,
    );
  }

  throw new Error(`Spotify access denied (${lastStatus || 403})${lastMessage ? `: ${lastMessage}` : ""}. Attempts: ${attemptSummaries.join(", ")}.`);
}

async function fetchCurrentUserProfile(candidates: TokenCandidate[]) {
  const response = await spotifyGetWithCandidates("https://api.spotify.com/v1/me", candidates);
  return (await response.json()) as SpotifyUserProfile;
}

async function fetchPlaylistMeta(playlistId: string, candidates: TokenCandidate[]) {
  const response = await spotifyGetWithCandidates(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,owner(id,display_name)`,
    candidates,
  );

  return (await response.json()) as SpotifyPlaylistMetaResponse;
}

async function fetchPlaylistCatalog(playlistId: string, candidates: TokenCandidate[]) {
  const tracks: CatalogEntry[] = [];
  const artists: CatalogEntry[] = [];
  const seenTrackIds = new Set<string>();
  const seenArtistIds = new Set<string>();

  let nextUrl: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/items` +
    `?limit=100&offset=0&fields=items(item(id,name,type,is_local,artists(id,name),album(release_date))),next`;
  while (nextUrl) {
    const response = await spotifyGetWithCandidates(nextUrl, candidates);
    const page = (await response.json()) as SpotifyPlaylistTracksResponse;
    for (const item of page.items) {
      const track = item.item ?? item.track;
      if (!track || track.type !== "track" || track.is_local) {
        continue;
      }

      const trackId = track.id?.trim() ?? "";
      const trackName = track.name.trim();
      if (!trackId || !trackName) {
        continue;
      }

      if (!seenTrackIds.has(trackId)) {
        seenTrackIds.add(trackId);
        tracks.push({
          id: trackId,
          display: trackName,
        });
      }

      for (const artist of track.artists) {
        const artistId = artist.id?.trim() ?? "";
        const artistName = artist.name.trim();
        if (!artistId || !artistName || seenArtistIds.has(artistId)) {
          continue;
        }

        seenArtistIds.add(artistId);
        artists.push({
          id: artistId,
          display: artistName,
        });
      }
    }

    nextUrl = page.next;
  }

  if (tracks.length === 0 || artists.length === 0) {
    throw new Error("Playlist produced no usable tracks/artists.");
  }

  return { tracks, artists };
}

async function userTokenCandidateFromRequest(request: Request): Promise<TokenCandidate | null> {
  const encodedRefreshToken = parseCookieValue(request.headers.get("Cookie"), spotifyRefreshCookieName);
  if (!encodedRefreshToken) {
    return null;
  }

  const refreshToken = decodeURIComponent(encodedRefreshToken);
  if (!refreshToken) {
    return null;
  }

  try {
    const token = await fetchSpotifyToken("refresh_token", refreshToken);
    return {
      token,
      source: "user",
    };
  } catch {
    return null;
  }
}

async function nextBaseBatteryVersion() {
  const gameDataDir = path.join(process.cwd(), "public", "game-data");
  await mkdir(gameDataDir, { recursive: true });

  const fileNames = await readdir(gameDataDir);
  let maxVersion = 0;
  for (const fileName of fileNames) {
    const match = /^base-battery\.v(\d+)\.json$/u.exec(fileName);
    if (!match) {
      continue;
    }

    const version = Number.parseInt(match[1]!, 10);
    if (Number.isFinite(version) && version > maxVersion) {
      maxVersion = version;
    }
  }

  return maxVersion + 1;
}

export async function generateBaseBatteryFromPlaylist(
  rawPlaylist: string,
  request: Request,
  accessTokenOverride?: string,
): Promise<GenerateBaseBatteryResult> {
  const playlistId = parseSpotifyPlaylistId(rawPlaylist);
  if (!playlistId) {
    throw new Error("Invalid Spotify playlist ID/URL.");
  }

  const userCandidate = await userTokenCandidateFromRequest(request);
  const browserToken = accessTokenOverride?.trim() ?? "";
  const tokenCandidates: TokenCandidate[] = [];
  if (browserToken) {
    tokenCandidates.push({
      token: browserToken,
      source: "browser",
    });
  }
  if (userCandidate) {
    tokenCandidates.push(userCandidate);
  }

  if (tokenCandidates.length === 0) {
    throw new Error(
      "Missing Spotify user token. Connect Spotify in host setup and retry.",
    );
  }

  const [profile, meta] = await Promise.all([
    fetchCurrentUserProfile(tokenCandidates),
    fetchPlaylistMeta(playlistId, tokenCandidates),
  ]);
  const ownerId = meta.owner?.id?.trim() ?? "";
  const userId = profile.id.trim();

  let catalog: { tracks: CatalogEntry[]; artists: CatalogEntry[] };
  try {
    catalog = await fetchPlaylistCatalog(playlistId, tokenCandidates);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Spotify access denied")) {
      throw new Error(
        `Spotify denied playlist items. Since February 2026, playlist items can only be read for playlists you own/collaborate on. ` +
          `Connected user: ${userId || "unknown"}. Playlist owner: ${ownerId || "unknown"}. ` +
          `Create/copy this playlist under your account and retry.`,
      );
    }
    throw error;
  }

  const version = await nextBaseBatteryVersion();
  const fileName = `base-battery.v${version}.json`;
  const gameDataDir = path.join(process.cwd(), "public", "game-data");
  const baseBatteryPath = path.join(gameDataDir, fileName);
  const latestVersionPath = path.join(gameDataDir, "base-battery.latest.json");

  const payload: BaseBatteryAsset = {
    kind: "base-battery",
    version,
    tracks: catalog.tracks,
    artists: catalog.artists,
  };
  const latestPayload: BaseBatteryVersionAsset = {
    kind: "base-battery-version",
    version,
  };

  await writeFile(baseBatteryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(latestVersionPath, `${JSON.stringify(latestPayload, null, 2)}\n`, "utf8");

  return {
    version,
    fileName,
    playlistId: meta.id,
    playlistName: meta.name,
    trackCount: payload.tracks.length,
    artistCount: payload.artists.length,
  };
}
