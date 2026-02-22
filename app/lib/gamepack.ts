import {
  buildAutocompleteIndex,
  normalizeForAutocomplete,
  type AutocompleteIndex,
} from "~/lib/autocomplete";
import { mockRounds } from "~/lib/mock-room";

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
  playlistId: string;
  version: number;
  hash: string;
  pack: PlaylistPackAsset;
  updatedAt: number;
};

type DataSource = "cache" | "fresh";

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

async function readStoredPlaylistPack(db: IDBDatabase, playlistId: string, version: number) {
  const tx = db.transaction(storePacks, "readonly");
  const request = tx.objectStore(storePacks).get(`playlist:${playlistId}:v${version}`);
  const value = (await requestPromise(request)) as StoredPackRecord | undefined;
  await transactionDone(tx);
  return value?.pack ?? null;
}

async function writeStoredPlaylistPack(db: IDBDatabase, asset: PlaylistPackAsset, hash: string) {
  const tx = db.transaction(storePacks, "readwrite");
  const record: StoredPackRecord = {
    key: `playlist:${asset.playlistId}:v${asset.version}`,
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

    if (knownIds.has(id) || knownNormDisplays.has(normDisplay)) {
      continue;
    }

    store.put({ id, display });
    knownIds.add(id);
    knownNormDisplays.add(normDisplay);
  }

  await transactionDone(tx);
}

async function resolvePlaylistPackVersions(playlistIds: string[]) {
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

    const firstPlaylistId = catalog.playlists.find(
      (entry) =>
        typeof entry?.id === "string" &&
        entry.id.trim().length > 0 &&
        typeof entry?.version === "number" &&
        Number.isFinite(entry.version) &&
        entry.version >= 1,
    )?.id;

    return typeof firstPlaylistId === "string" ? [firstPlaylistId.trim()] : [...defaultPlaylistIds];
  } catch {
    return [...defaultPlaylistIds];
  }
}

async function ensurePlaylistPack(
  db: IDBDatabase,
  playlistId: string,
  version: number,
): Promise<{ source: DataSource; hash: string; pack: PlaylistPackAsset }> {
  const metaKey = `playlist-pack:${playlistId}`;
  const existing = await readMeta(db, metaKey);
  if (existing && existing.version === version) {
    const cachedPack = await readStoredPlaylistPack(db, playlistId, version);
    if (cachedPack) {
      return {
        source: "cache",
        hash: existing.hash,
        pack: cachedPack,
      };
    }
  }

  const asset = await fetchJsonAsset<PlaylistPackAsset>(`/game-data/playlists/${playlistId}.v${version}.json`);
  if (asset.kind !== "playlist-pack" || asset.playlistId !== playlistId || asset.version !== version) {
    throw new Error(`Invalid playlist pack: ${playlistId}`);
  }

  await mergeCatalogEntries(db, storeTracks, asset.tracks);
  await mergeCatalogEntries(db, storeArtists, asset.artists);

  const hash = stableHash(asset);
  await writeStoredPlaylistPack(db, asset, hash);
  await writeMeta(db, {
    key: metaKey,
    version: asset.version,
    hash,
    updatedAt: Date.now(),
  });

  return {
    source: "fresh",
    hash,
    pack: asset,
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
    const safePlaylistIds = playlistIds.length > 0 ? playlistIds : await resolveDefaultPlaylistIdsFromCatalog();
    if (safePlaylistIds.length === 0) {
      return {
        pack: fallbackGamePack(roomId),
        source: "memory",
      };
    }
    const playlistVersions = await resolvePlaylistPackVersions(safePlaylistIds);
    const playlistResults = await Promise.all(
      safePlaylistIds.map((playlistId) =>
        ensurePlaylistPack(db!, playlistId, playlistVersions[playlistId] ?? 1),
      ),
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
          playlistIds: safePlaylistIds,
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
