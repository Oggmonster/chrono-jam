import fs from "node:fs";
import path from "node:path";

import { mockRounds } from "~/lib/mock-room";

export type PlaylistRound = {
  id: string;
  trackId: string;
  title: string;
  artistId: string;
  artist: string;
  year: number;
  spotifyUri: string;
  startMs: number;
};

const playlistDataDir = path.join(process.cwd(), "public", "game-data", "playlists");
const playlistCatalogPath = path.join(playlistDataDir, "index.json");
export const defaultPlaylistIds = ["core-pop"] as const;

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
  }>;
};

function normalizePlaylistIds(playlistIds: string[]) {
  const sanitized = playlistIds
    .map((playlistId) => playlistId.trim())
    .filter((playlistId) => playlistId.length > 0);
  const unique = [...new Set(sanitized)];
  return unique.length > 0 ? unique : [...defaultPlaylistIds];
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
    const stats = fs.statSync(playlistCatalogPath);
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

  const raw = safeReadJson(playlistCatalogPath);
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

const packRoundCache = new Map<string, PlaylistRound[]>();
const playlistRoundCache = new Map<string, PlaylistRound[]>();

function loadPackRounds(playlistId: string, version: number) {
  const cacheKey = `${playlistId}:v${version}`;
  const cached = packRoundCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const packPath = path.join(playlistDataDir, `${playlistId}.v${version}.json`);
  const raw = safeReadJson(packPath);
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const asset = raw as Partial<PlaylistPackAsset>;
  if (
    asset.kind !== "playlist-pack" ||
    asset.playlistId !== playlistId ||
    asset.version !== version ||
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
      title: rawRound.trackName.trim(),
      artistId: rawRound.artistId.trim(),
      artist: rawRound.artistName.trim(),
      year: Math.floor(rawRound.year),
      spotifyUri: rawRound.spotifyUri.trim(),
      startMs:
        typeof rawRound.startMs === "number" && Number.isFinite(rawRound.startMs)
          ? Math.max(0, Math.floor(rawRound.startMs))
          : 0,
    });
  }

  packRoundCache.set(cacheKey, rounds);
  return rounds;
}

export function loadRoundsForPlaylistIds(playlistIds: string[]) {
  const normalizedIds = normalizePlaylistIds(playlistIds);
  const cacheKey = normalizedIds.join(",");
  const cached = playlistRoundCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const versionMap = loadVersionMap();
  const byRoundId = new Map<string, PlaylistRound>();

  for (const playlistId of normalizedIds) {
    const version = versionMap.get(playlistId) ?? 1;
    const packRounds = loadPackRounds(playlistId, version);
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
