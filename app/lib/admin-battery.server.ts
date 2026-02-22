import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CatalogEntry, GamePackRound } from "~/lib/gamepack";
import { cleanTrackTitle, hasRemasterMarker } from "~/lib/track-metadata";
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
      duration_ms?: number;
      external_ids?: {
        isrc?: string;
      };
      artists?: Array<{ id: string | null; name: string }>;
      album?: {
        release_date?: string;
        images?: Array<{
          url?: string;
          width?: number | null;
          height?: number | null;
        }>;
      };
    } | null;
    track?: {
      id: string | null;
      name: string;
      type: string;
      is_local: boolean;
      duration_ms?: number;
      external_ids?: {
        isrc?: string;
      };
      artists: Array<{ id: string | null; name: string }>;
      album?: {
        release_date?: string;
        images?: Array<{
          url?: string;
          width?: number | null;
          height?: number | null;
        }>;
      };
    } | null;
  }>;
  next: string | null;
};

type SpotifyTrackSearchResponse = {
  tracks?: {
    items?: Array<{
      album?: {
        release_date?: string;
      };
    }>;
  };
};

type PlaylistPackAsset = {
  kind: "playlist-pack";
  playlistId: string;
  version: number;
  tracks: CatalogEntry[];
  artists: CatalogEntry[];
  rounds: GamePackRound[];
};

type PlaylistCatalogAsset = {
  kind: "playlist-catalog";
  playlists: Array<{
    id: string;
    name: string;
    version: number;
    sourcePlaylistId?: string;
    sourcePlaylistName?: string;
    trackCount?: number;
    artistCount?: number;
    roundCount?: number;
  }>;
};

export type GeneratePlaylistPackResult = {
  version: number;
  fileName: string;
  playlistId: string;
  playlistName: string;
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  trackCount: number;
  artistCount: number;
  roundCount: number;
};

type TokenCandidate = {
  token: string;
  source: "user" | "browser";
};

type SpotifyUserProfile = {
  id: string;
  display_name?: string;
};

type PlaylistRoundSeed = {
  trackId: string;
  trackName: string;
  artistId: string;
  artistName: string;
  year: number;
  spotifyUri: string;
  startMs: number;
  coverUrl?: string;
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

function parseReleaseYear(releaseDate: string | undefined) {
  if (!releaseDate) {
    return null;
  }

  const yearText = releaseDate.slice(0, 4);
  const year = Number.parseInt(yearText, 10);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) {
    return null;
  }

  return year;
}

function pickCoverUrl(images: Array<{ url?: string }> | undefined) {
  if (!Array.isArray(images) || images.length === 0) {
    return undefined;
  }

  for (const image of images) {
    const url = typeof image?.url === "string" ? image.url.trim() : "";
    if (url) {
      return url;
    }
  }

  return undefined;
}

function buildRoundStartMs(durationMs: number | undefined) {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return 30_000;
  }

  const safeDuration = Math.max(0, durationMs);
  const target = Math.floor(safeDuration * 0.35);
  return Math.max(0, Math.min(60_000, target));
}

function normalizePlaylistPackId(rawValue: string) {
  const normalized = rawValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || normalized.length > 48) {
    return null;
  }
  return normalized;
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

async function fetchOriginalReleaseYearByIsrc(
  isrc: string | undefined,
  candidates: TokenCandidate[],
  cache: Map<string, number | null>,
) {
  const normalizedIsrc = isrc?.trim().toUpperCase() ?? "";
  if (!normalizedIsrc) {
    return null;
  }

  if (cache.has(normalizedIsrc)) {
    return cache.get(normalizedIsrc) ?? null;
  }

  const query = encodeURIComponent(`isrc:${normalizedIsrc}`);
  try {
    const response = await spotifyGetWithCandidates(
      `https://api.spotify.com/v1/search?type=track&limit=50&q=${query}`,
      candidates,
    );
    const payload = (await response.json()) as SpotifyTrackSearchResponse;
    const years = (payload.tracks?.items ?? [])
      .map((item) => parseReleaseYear(item.album?.release_date))
      .filter((year): year is number => typeof year === "number");
    if (years.length === 0) {
      cache.set(normalizedIsrc, null);
      return null;
    }

    const earliest = Math.min(...years);
    const safeYear = Number.isFinite(earliest) ? earliest : null;
    cache.set(normalizedIsrc, safeYear);
    return safeYear;
  } catch {
    cache.set(normalizedIsrc, null);
    return null;
  }
}

async function fetchPlaylistCatalog(playlistId: string, candidates: TokenCandidate[]) {
  const tracks: CatalogEntry[] = [];
  const artists: CatalogEntry[] = [];
  const roundSeeds: PlaylistRoundSeed[] = [];
  const seenTrackIds = new Set<string>();
  const seenArtistIds = new Set<string>();
  const isrcOriginalYearCache = new Map<string, number | null>();

  let nextUrl: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/items` +
    `?limit=100&offset=0&fields=items(item(id,name,type,is_local,duration_ms,external_ids(isrc),artists(id,name),album(release_date,images(url,height,width))),track(id,name,type,is_local,duration_ms,external_ids(isrc),artists(id,name),album(release_date,images(url,height,width)))),next`;
  while (nextUrl) {
    const response = await spotifyGetWithCandidates(nextUrl, candidates);
    const page = (await response.json()) as SpotifyPlaylistTracksResponse;
    for (const item of page.items) {
      const track = item.item ?? item.track;
      if (!track || track.type !== "track" || track.is_local) {
        continue;
      }

      const trackId = track.id?.trim() ?? "";
      const rawTrackName = track.name.trim();
      const cleanedTrackName = cleanTrackTitle(rawTrackName);
      const trackName = cleanedTrackName || rawTrackName;
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

      const artistList = Array.isArray(track.artists) ? track.artists : [];
      for (const artist of artistList) {
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

      const albumReleaseYear = parseReleaseYear(track.album?.release_date);
      const hasRemaster = hasRemasterMarker(rawTrackName);
      const originalReleaseYear =
        hasRemaster
          ? await fetchOriginalReleaseYearByIsrc(track.external_ids?.isrc, candidates, isrcOriginalYearCache)
          : null;
      const releaseYear = originalReleaseYear ?? albumReleaseYear;
      const primaryArtist = artistList.find(
        (artist) => typeof artist.id === "string" && artist.id.trim().length > 0 && artist.name.trim().length > 0,
      );
      if (!releaseYear || !primaryArtist) {
        continue;
      }

      roundSeeds.push({
        trackId,
        trackName,
        artistId: primaryArtist.id!.trim(),
        artistName: primaryArtist.name.trim(),
        year: releaseYear,
        spotifyUri: `spotify:track:${trackId}`,
        startMs: buildRoundStartMs(track.duration_ms),
        coverUrl: pickCoverUrl(track.album?.images),
      });
    }

    nextUrl = page.next;
  }

  if (tracks.length === 0 || artists.length === 0) {
    throw new Error("Playlist produced no usable tracks/artists.");
  }

  return { tracks, artists, roundSeeds };
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

async function nextPlaylistPackVersion(playlistPackId: string) {
  const playlistsDir = path.join(process.cwd(), "public", "game-data", "playlists");
  await mkdir(playlistsDir, { recursive: true });

  const escapedPackId = playlistPackId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const versionPattern = new RegExp(`^${escapedPackId}\\.v(\\d+)\\.json$`, "u");

  const fileNames = await readdir(playlistsDir);
  let maxVersion = 0;
  for (const fileName of fileNames) {
    const match = versionPattern.exec(fileName);
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

async function readPlaylistCatalogFile() {
  const playlistsDir = path.join(process.cwd(), "public", "game-data", "playlists");
  const indexPath = path.join(playlistsDir, "index.json");

  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as PlaylistCatalogAsset;
    if (parsed.kind === "playlist-catalog" && Array.isArray(parsed.playlists)) {
      return parsed;
    }
  } catch {
    // Fall back to default catalog.
  }

  return {
    kind: "playlist-catalog",
    playlists: [],
  } satisfies PlaylistCatalogAsset;
}

export async function generatePlaylistPackFromPlaylist(
  rawPlaylistPackId: string,
  rawPlaylist: string,
  request: Request,
  accessTokenOverride?: string,
): Promise<GeneratePlaylistPackResult> {
  const playlistPackId = normalizePlaylistPackId(rawPlaylistPackId);
  if (!playlistPackId) {
    throw new Error("Invalid pack ID. Use letters, numbers, and dashes.");
  }

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
    throw new Error("Missing Spotify user token. Connect Spotify in host setup and retry.");
  }

  const [profile, meta] = await Promise.all([
    fetchCurrentUserProfile(tokenCandidates),
    fetchPlaylistMeta(playlistId, tokenCandidates),
  ]);

  const ownerId = meta.owner?.id?.trim() ?? "";
  const userId = profile.id.trim();

  let catalog: { tracks: CatalogEntry[]; artists: CatalogEntry[]; roundSeeds: PlaylistRoundSeed[] };
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

  const rounds: GamePackRound[] = catalog.roundSeeds.map((seed, index) => ({
    roundId: `${playlistPackId}-r${index + 1}`,
    trackId: seed.trackId,
    trackName: seed.trackName,
    artistId: seed.artistId,
    artistName: seed.artistName,
    year: seed.year,
    spotifyUri: seed.spotifyUri,
    startMs: seed.startMs,
    coverUrl: seed.coverUrl,
  }));

  if (rounds.length === 0) {
    throw new Error("Playlist pack produced no usable rounds (missing release years/artists).");
  }

  const version = await nextPlaylistPackVersion(playlistPackId);
  const fileName = `${playlistPackId}.v${version}.json`;
  const playlistsDir = path.join(process.cwd(), "public", "game-data", "playlists");
  const playlistPackPath = path.join(playlistsDir, fileName);
  const indexPath = path.join(playlistsDir, "index.json");

  const payload: PlaylistPackAsset = {
    kind: "playlist-pack",
    playlistId: playlistPackId,
    version,
    tracks: catalog.tracks,
    artists: catalog.artists,
    rounds,
  };

  const existingCatalog = await readPlaylistCatalogFile();
  const nextCatalog: PlaylistCatalogAsset = {
    kind: "playlist-catalog",
    playlists: [
      ...existingCatalog.playlists.filter((entry) => entry.id !== playlistPackId),
      {
        id: playlistPackId,
        name: meta.name,
        version,
        sourcePlaylistId: meta.id,
        sourcePlaylistName: meta.name,
        trackCount: catalog.tracks.length,
        artistCount: catalog.artists.length,
        roundCount: rounds.length,
      },
    ].sort((a, b) => a.id.localeCompare(b.id)),
  };

  await writeFile(playlistPackPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(indexPath, `${JSON.stringify(nextCatalog, null, 2)}\n`, "utf8");

  return {
    version,
    fileName,
    playlistId: playlistPackId,
    playlistName: meta.name,
    sourcePlaylistId: meta.id,
    sourcePlaylistName: meta.name,
    trackCount: payload.tracks.length,
    artistCount: payload.artists.length,
    roundCount: payload.rounds.length,
  };
}
