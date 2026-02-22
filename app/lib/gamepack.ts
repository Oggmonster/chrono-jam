import {
  buildAutocompleteIndex,
  normalizeForAutocomplete,
  type AutocompleteIndex,
} from "~/lib/autocomplete";
import { mockRounds } from "~/lib/mock-room";
import {
  buildBasePlaylistSelectionId,
  buildUserPlaylistSelectionId,
  parsePlaylistSelectionId,
} from "~/lib/playlist-selection";
import { cleanTrackTitle } from "~/lib/track-metadata";

export type CatalogEntry = {
  id: string;
  display: string;
};

export type GamePackRound = {
  roundId: string;
  trackId: string;
  trackName: string;
  artistId: string;
  artistName: string;
  year: number;
  spotifyUri: string;
  startMs: number;
  coverUrl?: string;
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
    trackCount?: number;
    artistCount?: number;
    roundCount?: number;
  }>;
};

export type GamePack = {
  meta: {
    version: number;
    roomId: string;
    hash: string;
    createdAt: number;
    roundCount: number;
    playlistIds: string[];
  };
  rounds: GamePackRound[];
};

export type CatalogAutocompletePack = {
  tracks: AutocompleteIndex;
  artists: AutocompleteIndex;
};

type StoreMetaRecord = {
  key: string;
  version: number;
  hash: string;
  updatedAt: number;
};

type StoredPackRecord = {
  key: string;
  selectionId: string;
  playlistId: string;
  version: number;
  hash: string;
  pack: PlaylistPackAsset;
  updatedAt: number;
};

type DataSource = "cache" | "fresh";

type PlaylistPackRequest = {
  selectionId: string;
  playlistId: string;
  version: number;
  fetchPath: string;
};

export type GamePackLoadResult = {
  pack: GamePack;
  source: "cache" | "fresh" | "mixed" | "memory";
};

export const defaultPlaylistIds: string[] = [];

const dbName = "chronojam-catalog-cache";
const dbVersion = 1;
const storeMeta = "meta";
const storeTracks = "tracks";
const storeArtists = "artists";
const storePacks = "packs";
let cachedAutocompletePack: { key: string; pack: CatalogAutocompletePack } | null = null;

function fnv1a(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableHash(value: unknown) {
  return fnv1a(JSON.stringify(value));
}

function requestPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openCatalogDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = indexedDB.open(dbName, dbVersion);
    request.onerror = () => reject(request.error ?? new Error("Failed to open catalog db"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeMeta)) {
        db.createObjectStore(storeMeta, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(storeTracks)) {
        db.createObjectStore(storeTracks, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(storeArtists)) {
        db.createObjectStore(storeArtists, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(storePacks)) {
        db.createObjectStore(storePacks, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function fetchJsonAsset<T>(path: string) {
  const response = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status})`);
  }

  return (await response.json()) as T;
}

function sanitizeCatalogEntry(entry: CatalogEntry): CatalogEntry {
  const id = entry.id.trim();
  const display = cleanTrackTitle(entry.display);
  return {
    id,
    display: display || entry.display.trim(),
  };
}

function sanitizeRound(round: GamePackRound): GamePackRound {
  const trackName = cleanTrackTitle(round.trackName);
  const coverUrl = typeof round.coverUrl === "string" && round.coverUrl.trim().length > 0 ? round.coverUrl.trim() : undefined;
  return {
    ...round,
    trackName: trackName || round.trackName.trim(),
    coverUrl,
  };
}

function sanitizePlaylistPack(asset: PlaylistPackAsset): PlaylistPackAsset {
  return {
    ...asset,
    tracks: asset.tracks.map(sanitizeCatalogEntry),
    rounds: asset.rounds.map(sanitizeRound),
  };
}

async function readMeta(db: IDBDatabase, key: string) {
  const tx = db.transaction(storeMeta, "readonly");
  const request = tx.objectStore(storeMeta).get(key);
  const value = (await requestPromise(request)) as StoreMetaRecord | undefined;
  await transactionDone(tx);
  return value ?? null;
}

async function writeMeta(db: IDBDatabase, meta: StoreMetaRecord) {
  const tx = db.transaction(storeMeta, "readwrite");
  tx.objectStore(storeMeta).put(meta);
  await transactionDone(tx);
}

async function readStoredPlaylistPack(db: IDBDatabase, selectionId: string) {
  const tx = db.transaction(storePacks, "readonly");
  const request = tx.objectStore(storePacks).get(`selection:${selectionId}`);
  const value = (await requestPromise(request)) as StoredPackRecord | undefined;
  await transactionDone(tx);
  return value?.pack ?? null;
}

async function writeStoredPlaylistPack(db: IDBDatabase, selectionId: string, asset: PlaylistPackAsset, hash: string) {
  const tx = db.transaction(storePacks, "readwrite");
  const record: StoredPackRecord = {
    key: `selection:${selectionId}`,
    selectionId,
    playlistId: asset.playlistId,
    version: asset.version,
    hash,
    pack: asset,
    updatedAt: Date.now(),
  };
  tx.objectStore(storePacks).put(record);
  await transactionDone(tx);
}

async function readCatalogEntries(db: IDBDatabase, storeName: typeof storeTracks | typeof storeArtists) {
  const tx = db.transaction(storeName, "readonly");
  const request = tx.objectStore(storeName).getAll();
  const entries = (await requestPromise(request)) as CatalogEntry[];
  await transactionDone(tx);
  return entries;
}

async function mergeCatalogEntries(db: IDBDatabase, storeName: typeof storeTracks | typeof storeArtists, entries: CatalogEntry[]) {
  const readTx = db.transaction(storeName, "readonly");
  const readRequest = readTx.objectStore(storeName).getAll();
  const existing = (await requestPromise(readRequest)) as CatalogEntry[];
  await transactionDone(readTx);

  const knownIds = new Set(existing.map((entry) => entry.id));
  const knownNormDisplays = new Set(existing.map((entry) => normalizeForAutocomplete(entry.display)));
  const existingById = new Map(existing.map((entry) => [entry.id, entry] as const));
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  for (const entry of entries) {
    const id = entry.id.trim();
    const display = entry.display.trim();
    if (!id || !display) {
      continue;
    }

    const normDisplay = normalizeForAutocomplete(display);
    if (!normDisplay) {
      continue;
    }

    const existingEntry = existingById.get(id);
    if (existingEntry) {
      if (existingEntry.display !== display) {
        store.put({ id, display });
        const existingNorm = normalizeForAutocomplete(existingEntry.display);
        if (existingNorm) {
          knownNormDisplays.delete(existingNorm);
        }
        knownNormDisplays.add(normDisplay);
        existingById.set(id, { id, display });
      }
      continue;
    }

    if (knownNormDisplays.has(normDisplay)) {
      continue;
    }

    store.put({ id, display });
    knownIds.add(id);
    knownNormDisplays.add(normDisplay);
  }

  await transactionDone(tx);
}

async function resolveLegacyPlaylistPackVersions(playlistIds: string[]) {
  const defaultVersions = Object.fromEntries(playlistIds.map((playlistId) => [playlistId, 1] as const)) as Record<
    string,
    number
  >;

  try {
    const catalog = await fetchJsonAsset<PlaylistCatalogAsset>("/game-data/playlists/index.json");
    if (catalog.kind !== "playlist-catalog" || !Array.isArray(catalog.playlists)) {
      return defaultVersions;
    }

    const byId = new Map(
      catalog.playlists
        .filter(
          (entry): entry is PlaylistCatalogAsset["playlists"][number] =>
            typeof entry?.id === "string" &&
            entry.id.trim().length > 0 &&
            typeof entry?.version === "number" &&
            Number.isFinite(entry.version) &&
            entry.version >= 1,
        )
        .map((entry) => [entry.id.trim(), Math.floor(entry.version)] as const),
    );

    const resolved: Record<string, number> = {};
    for (const playlistId of playlistIds) {
      resolved[playlistId] = byId.get(playlistId) ?? 1;
    }

    return resolved;
  } catch {
    return defaultVersions;
  }
}

async function resolveDefaultPlaylistIdsFromCatalog() {
  try {
    const catalog = await fetchJsonAsset<PlaylistCatalogAsset>("/game-data/playlists/index.json");
    if (catalog.kind !== "playlist-catalog" || !Array.isArray(catalog.playlists)) {
      return [...defaultPlaylistIds];
    }

    const firstPlaylist = catalog.playlists.find(
      (entry) =>
        typeof entry?.id === "string" &&
        entry.id.trim().length > 0 &&
        typeof entry?.version === "number" &&
        Number.isFinite(entry.version) &&
        entry.version >= 1,
    );

    if (!firstPlaylist) {
      return [...defaultPlaylistIds];
    }

    return [buildBasePlaylistSelectionId(firstPlaylist.id.trim(), Math.floor(firstPlaylist.version))];
  } catch {
    return [...defaultPlaylistIds];
  }
}

function trimUniquePlaylistIds(playlistIds: string[]) {
  const sanitized = playlistIds
    .map((playlistId) => playlistId.trim())
    .filter((playlistId) => playlistId.length > 0);
  return [...new Set(sanitized)];
}

async function buildPlaylistPackRequests(playlistIds: string[]) {
  const uniquePlaylistIds = trimUniquePlaylistIds(playlistIds);
  const legacyPlaylistIds = uniquePlaylistIds.filter((playlistId) => parsePlaylistSelectionId(playlistId) === null);
  const legacyVersions = legacyPlaylistIds.length > 0
    ? await resolveLegacyPlaylistPackVersions(legacyPlaylistIds)
    : {};

  const requests: PlaylistPackRequest[] = [];
  for (const requestedId of uniquePlaylistIds) {
    const parsed = parsePlaylistSelectionId(requestedId);
    if (parsed) {
      if (parsed.scope === "base") {
        requests.push({
          selectionId: buildBasePlaylistSelectionId(parsed.playlistId, parsed.version),
          playlistId: parsed.playlistId,
          version: parsed.version,
          fetchPath: `/game-data/playlists/${parsed.playlistId}.v${parsed.version}.json`,
        });
      } else {
        requests.push({
          selectionId: buildUserPlaylistSelectionId(parsed.ownerSpotifyUserId, parsed.playlistId, parsed.version),
          playlistId: parsed.playlistId,
          version: parsed.version,
          fetchPath:
            `/game-data/user-playlists/${encodeURIComponent(parsed.ownerSpotifyUserId)}` +
            `/${parsed.playlistId}.v${parsed.version}.json`,
        });
      }
      continue;
    }

    try {
      const version = legacyVersions[requestedId] ?? 1;
      requests.push({
        selectionId: buildBasePlaylistSelectionId(requestedId, version),
        playlistId: requestedId,
        version,
        fetchPath: `/game-data/playlists/${requestedId}.v${version}.json`,
      });
    } catch {
      // Skip invalid legacy identifiers.
    }
  }

  const bySelectionId = new Map<string, PlaylistPackRequest>();
  for (const request of requests) {
    bySelectionId.set(request.selectionId, request);
  }

  return [...bySelectionId.values()];
}

async function ensurePlaylistPack(
  db: IDBDatabase,
  request: PlaylistPackRequest,
): Promise<{ source: DataSource; hash: string; pack: PlaylistPackAsset }> {
  const metaKey = `playlist-pack:${request.selectionId}`;
  const existing = await readMeta(db, metaKey);
  if (existing && existing.version === request.version) {
    const cachedPack = await readStoredPlaylistPack(db, request.selectionId);
    if (cachedPack) {
      const sanitizedCachedPack = sanitizePlaylistPack(cachedPack);
      return {
        source: "cache",
        hash: existing.hash,
        pack: sanitizedCachedPack,
      };
    }
  }

  const asset = await fetchJsonAsset<PlaylistPackAsset>(request.fetchPath);
  if (asset.kind !== "playlist-pack" || asset.playlistId !== request.playlistId || asset.version !== request.version) {
    throw new Error(`Invalid playlist pack: ${request.selectionId}`);
  }
  const sanitizedAsset = sanitizePlaylistPack(asset);

  await mergeCatalogEntries(db, storeTracks, sanitizedAsset.tracks);
  await mergeCatalogEntries(db, storeArtists, sanitizedAsset.artists);

  const hash = stableHash(sanitizedAsset);
  await writeStoredPlaylistPack(db, request.selectionId, sanitizedAsset, hash);
  await writeMeta(db, {
    key: metaKey,
    version: request.version,
    hash,
    updatedAt: Date.now(),
  });

  return {
    source: "fresh",
    hash,
    pack: sanitizedAsset,
  };
}

function fallbackGamePack(roomId: string): GamePack {
  const rounds: GamePackRound[] = mockRounds.map((round) => ({
    roundId: round.id,
    trackId: round.trackId,
    trackName: round.title,
    artistId: round.artistId,
    artistName: round.artist,
    year: round.year,
    spotifyUri: round.spotifyUri,
    startMs: round.startMs,
    coverUrl: round.coverUrl,
  }));

  return {
    meta: {
      version: 1,
      roomId,
      hash: stableHash(rounds),
      createdAt: Date.now(),
      roundCount: rounds.length,
      playlistIds: [...defaultPlaylistIds],
    },
    rounds,
  };
}

export async function loadGamePack(
  roomId: string,
  playlistIds: string[] = [...defaultPlaylistIds],
): Promise<GamePackLoadResult> {
  let db: IDBDatabase | null = null;
  try {
    db = await openCatalogDb();
    const initialPlaylistIds = playlistIds.length > 0 ? playlistIds : await resolveDefaultPlaylistIdsFromCatalog();
    if (initialPlaylistIds.length === 0) {
      return {
        pack: fallbackGamePack(roomId),
        source: "memory",
      };
    }
    const playlistRequests = await buildPlaylistPackRequests(initialPlaylistIds);
    if (playlistRequests.length === 0) {
      return {
        pack: fallbackGamePack(roomId),
        source: "memory",
      };
    }

    const playlistResults = await Promise.all(
      playlistRequests.map((request) => ensurePlaylistPack(db!, request)),
    );

    const allRounds = playlistResults.flatMap((result) => result.pack.rounds);
    const dedupedRounds = Array.from(new Map(allRounds.map((round) => [round.roundId, round] as const)).values());
    const combinedHash = stableHash({
      packs: playlistResults.map((result) => result.hash).sort(),
      roundIds: dedupedRounds.map((round) => round.roundId),
    });

    const sources = playlistResults.map((result) => result.source);
    const source: GamePackLoadResult["source"] =
      sources.every((item) => item === "cache")
        ? "cache"
        : sources.every((item) => item === "fresh")
          ? "fresh"
          : "mixed";
    return {
      pack: {
        meta: {
          version: 1,
          roomId,
          hash: combinedHash,
          createdAt: Date.now(),
          roundCount: dedupedRounds.length,
          playlistIds: playlistRequests.map((request) => request.selectionId),
        },
        rounds: dedupedRounds,
      },
      source,
    };
  } catch {
    return {
      pack: fallbackGamePack(roomId),
      source: "memory",
    };
  } finally {
    db?.close();
  }
}

export function getCachedCatalogAutocompletePack(expectedKey?: string) {
  if (!cachedAutocompletePack) {
    return null;
  }

  if (expectedKey && cachedAutocompletePack.key !== expectedKey) {
    return null;
  }

  return cachedAutocompletePack.pack;
}

export async function loadCatalogAutocompletePack(cacheKey: string): Promise<CatalogAutocompletePack> {
  if (cachedAutocompletePack && cachedAutocompletePack.key === cacheKey) {
    return cachedAutocompletePack.pack;
  }

  const db = await openCatalogDb();
  const [tracks, artists] = await Promise.all([
    readCatalogEntries(db, storeTracks),
    readCatalogEntries(db, storeArtists),
  ]);
  db.close();

  const pack: CatalogAutocompletePack = {
    tracks: buildAutocompleteIndex(tracks),
    artists: buildAutocompleteIndex(artists),
  };

  cachedAutocompletePack = {
    key: cacheKey,
    pack,
  };

  return pack;
}
