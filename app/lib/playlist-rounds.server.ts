import fs from "node:fs";
import path from "node:path";

import { mockRounds } from "~/lib/mock-room";
import {
  buildBasePlaylistSelectionId,
  buildUserPlaylistSelectionId,
  parsePlaylistSelectionId,
} from "~/lib/playlist-selection";
import { cleanTrackTitle } from "~/lib/track-metadata";

export type PlaylistRound = {
  id: string;
  trackId: string;
  title: string;
  artistId: string;
  artist: string;
  year: number;
  spotifyUri: string;
  startMs: number;
  coverUrl?: string;
};

const basePlaylistDataDir = path.join(process.cwd(), "public", "game-data", "playlists");
const basePlaylistCatalogPath = path.join(basePlaylistDataDir, "index.json");
const userPlaylistDataDir = path.join(process.cwd(), "public", "game-data", "user-playlists");

type PlaylistCatalogAsset = {
  kind: "playlist-catalog";
  playlists: Array<{
    id: string;
    version: number;
  }>;
};

type PlaylistPackAsset = {
  kind: "playlist-pack";
  playlistId: string;
  version: number;
  rounds: Array<{
    roundId: string;
    trackId: string;
    trackName: string;
    artistId: string;
    artistName: string;
    year: number;
    spotifyUri: string;
    startMs: number;
    coverUrl?: string;
  }>;
};

function trimUniquePlaylistIds(playlistIds: string[]) {
  const sanitized = playlistIds
    .map((playlistId) => playlistId.trim())
    .filter((playlistId) => playlistId.length > 0);
  return [...new Set(sanitized)];
}

function fallbackRounds(): PlaylistRound[] {
  return mockRounds.map((round) => ({
    id: round.id,
    trackId: round.trackId,
    title: round.title,
    artistId: round.artistId,
    artist: round.artist,
    year: round.year,
    spotifyUri: round.spotifyUri,
    startMs: round.startMs,
    coverUrl: round.coverUrl,
  }));
}

function safeReadJson(pathname: string) {
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8")) as unknown;
  } catch {
    return null;
  }
}

let cachedVersionMap: Map<string, number> | null = null;
let cachedVersionMapMtimeMs = -1;

function loadVersionMap() {
  try {
    const stats = fs.statSync(basePlaylistCatalogPath);
    if (cachedVersionMap && stats.mtimeMs === cachedVersionMapMtimeMs) {
      return cachedVersionMap;
    }
    cachedVersionMapMtimeMs = stats.mtimeMs;
  } catch {
    if (cachedVersionMap) {
      return cachedVersionMap;
    }
    cachedVersionMap = new Map<string, number>();
    return cachedVersionMap;
  }

  const raw = safeReadJson(basePlaylistCatalogPath);
  if (!raw || typeof raw !== "object") {
    cachedVersionMap = new Map<string, number>();
    return cachedVersionMap;
  }

  const asset = raw as Partial<PlaylistCatalogAsset>;
  if (asset.kind !== "playlist-catalog" || !Array.isArray(asset.playlists)) {
    cachedVersionMap = new Map<string, number>();
    return cachedVersionMap;
  }

  const versions = new Map<string, number>();
  for (const entry of asset.playlists) {
    if (
      typeof entry?.id !== "string" ||
      entry.id.trim().length === 0 ||
      typeof entry?.version !== "number" ||
      !Number.isFinite(entry.version) ||
      entry.version < 1
    ) {
      continue;
    }

    versions.set(entry.id.trim(), Math.floor(entry.version));
  }

  cachedVersionMap = versions;
  return cachedVersionMap;
}

export function resolveDefaultPlaylistIds() {
  const versionMap = loadVersionMap();
  const firstPlaylistId = versionMap.keys().next().value as string | undefined;
  if (!firstPlaylistId) {
    return [];
  }

  const firstVersion = versionMap.get(firstPlaylistId) ?? 1;
  return [buildBasePlaylistSelectionId(firstPlaylistId, firstVersion)];
}

export function normalizePlaylistIdsForCatalog(playlistIds: string[]) {
  const unique = trimUniquePlaylistIds(playlistIds);
  const versionMap = loadVersionMap();
  const normalized: string[] = [];

  for (const playlistId of unique) {
    const parsedSelection = parsePlaylistSelectionId(playlistId);
    if (parsedSelection) {
      if (parsedSelection.scope === "base") {
        normalized.push(buildBasePlaylistSelectionId(parsedSelection.playlistId, parsedSelection.version));
      } else {
        normalized.push(
          buildUserPlaylistSelectionId(
            parsedSelection.ownerSpotifyUserId,
            parsedSelection.playlistId,
            parsedSelection.version,
          ),
        );
      }
      continue;
    }

    const legacyVersion = versionMap.get(playlistId);
    if (!legacyVersion) {
      continue;
    }

    normalized.push(buildBasePlaylistSelectionId(playlistId, legacyVersion));
  }

  const deduped = [...new Set(normalized)];
  if (deduped.length > 0) {
    return deduped;
  }

  return resolveDefaultPlaylistIds();
}

const packRoundCache = new Map<string, PlaylistRound[]>();
const playlistRoundCache = new Map<string, PlaylistRound[]>();

type PlaylistPackReference = {
  selectionId: string;
  playlistId: string;
  version: number;
  packPath: string;
};

function resolvePackReference(selectionId: string, versionMap: Map<string, number>): PlaylistPackReference | null {
  const parsedSelection = parsePlaylistSelectionId(selectionId);
  if (parsedSelection) {
    if (parsedSelection.scope === "base") {
      return {
        selectionId: buildBasePlaylistSelectionId(parsedSelection.playlistId, parsedSelection.version),
        playlistId: parsedSelection.playlistId,
        version: parsedSelection.version,
        packPath: path.join(basePlaylistDataDir, `${parsedSelection.playlistId}.v${parsedSelection.version}.json`),
      };
    }

    return {
      selectionId: buildUserPlaylistSelectionId(
        parsedSelection.ownerSpotifyUserId,
        parsedSelection.playlistId,
        parsedSelection.version,
      ),
      playlistId: parsedSelection.playlistId,
      version: parsedSelection.version,
      packPath: path.join(
        userPlaylistDataDir,
        parsedSelection.ownerSpotifyUserId,
        `${parsedSelection.playlistId}.v${parsedSelection.version}.json`,
      ),
    };
  }

  const legacyId = selectionId.trim();
  if (!legacyId) {
    return null;
  }

  const version = versionMap.get(legacyId);
  if (!version) {
    return null;
  }

  return {
    selectionId: buildBasePlaylistSelectionId(legacyId, version),
    playlistId: legacyId,
    version,
    packPath: path.join(basePlaylistDataDir, `${legacyId}.v${version}.json`),
  };
}

function loadPackRounds(reference: PlaylistPackReference) {
  const cached = packRoundCache.get(reference.selectionId);
  if (cached) {
    return cached;
  }

  const raw = safeReadJson(reference.packPath);
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const asset = raw as Partial<PlaylistPackAsset>;
  if (
    asset.kind !== "playlist-pack" ||
    asset.playlistId !== reference.playlistId ||
    asset.version !== reference.version ||
    !Array.isArray(asset.rounds)
  ) {
    return [];
  }

  const rounds: PlaylistRound[] = [];
  for (const rawRound of asset.rounds) {
    if (
      typeof rawRound?.roundId !== "string" ||
      rawRound.roundId.trim().length === 0 ||
      typeof rawRound?.trackId !== "string" ||
      rawRound.trackId.trim().length === 0 ||
      typeof rawRound?.trackName !== "string" ||
      rawRound.trackName.trim().length === 0 ||
      typeof rawRound?.artistId !== "string" ||
      rawRound.artistId.trim().length === 0 ||
      typeof rawRound?.artistName !== "string" ||
      rawRound.artistName.trim().length === 0 ||
      typeof rawRound?.year !== "number" ||
      !Number.isFinite(rawRound.year) ||
      typeof rawRound?.spotifyUri !== "string" ||
      rawRound.spotifyUri.trim().length === 0
    ) {
      continue;
    }

    rounds.push({
      id: rawRound.roundId.trim(),
      trackId: rawRound.trackId.trim(),
      title: cleanTrackTitle(rawRound.trackName.trim()) || rawRound.trackName.trim(),
      artistId: rawRound.artistId.trim(),
      artist: rawRound.artistName.trim(),
      year: Math.floor(rawRound.year),
      spotifyUri: rawRound.spotifyUri.trim(),
      startMs:
        typeof rawRound.startMs === "number" && Number.isFinite(rawRound.startMs)
          ? Math.max(0, Math.floor(rawRound.startMs))
          : 0,
      coverUrl:
        typeof rawRound.coverUrl === "string" && rawRound.coverUrl.trim().length > 0
          ? rawRound.coverUrl.trim()
          : undefined,
    });
  }

  packRoundCache.set(reference.selectionId, rounds);
  return rounds;
}

export function loadRoundsForPlaylistIds(playlistIds: string[]) {
  const normalizedIds = normalizePlaylistIdsForCatalog(playlistIds);
  const cacheKey = normalizedIds.join(",");
  const cached = playlistRoundCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const versionMap = loadVersionMap();
  const byRoundId = new Map<string, PlaylistRound>();

  for (const selectionId of normalizedIds) {
    const reference = resolvePackReference(selectionId, versionMap);
    if (!reference) {
      continue;
    }

    const packRounds = loadPackRounds(reference);
    for (const round of packRounds) {
      if (!byRoundId.has(round.id)) {
        byRoundId.set(round.id, round);
      }
    }
  }

  const rounds = [...byRoundId.values()];
  const finalRounds = rounds.length > 0 ? rounds : fallbackRounds();
  playlistRoundCache.set(cacheKey, finalRounds);
  return finalRounds;
}
