import { normalizeForAutocomplete } from "~/lib/autocomplete";
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

type PlaylistPackAsset = {
  kind: "playlist-pack";
  playlistId: string;
  version: number;
  tracks: CatalogEntry[];
  artists: CatalogEntry[];
  rounds: GamePackRound[];
};

export type GamePack = {
  meta: {
    version: number;
    roomId: string;
    hash: string;
    createdAt: number;
    roundCount: number;
    playlistIds: string[];
    batteryVersion: number;
  };
  rounds: GamePackRound[];
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

export const defaultPlaylistIds = ["core-pop"] as const;

const dbName = "chronojam-catalog-cache";
const dbVersion = 1;
const storeMeta = "meta";
const storeTracks = "tracks";
const storeArtists = "artists";
const storePacks = "packs";
const defaultBaseBatteryVersion = 1;

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

async function resolveBaseBatteryVersion() {
  try {
    const asset = await fetchJsonAsset<BaseBatteryVersionAsset>("/game-data/base-battery.latest.json");
    if (
      asset.kind === "base-battery-version" &&
      Number.isFinite(asset.version) &&
      asset.version >= 1
    ) {
      return Math.floor(asset.version);
    }
  } catch {
    // Fall through to default static version.
  }

  return defaultBaseBatteryVersion;
}

async function ensureBaseBattery(
  db: IDBDatabase,
  version: number,
): Promise<{ source: DataSource; hash: string; version: number }> {
  const metaKey = "base-battery";
  const existing = await readMeta(db, metaKey);
  if (existing && existing.version === version && existing.hash) {
    return { source: "cache", hash: existing.hash, version };
  }

  const asset = await fetchJsonAsset<BaseBatteryAsset>(`/game-data/base-battery.v${version}.json`);
  if (asset.kind !== "base-battery" || asset.version !== version) {
    throw new Error("Invalid base battery asset");
  }

  await mergeCatalogEntries(db, storeTracks, asset.tracks);
  await mergeCatalogEntries(db, storeArtists, asset.artists);

  const hash = stableHash(asset);
  await writeMeta(db, {
    key: metaKey,
    version: asset.version,
    hash,
    updatedAt: Date.now(),
  });

  return { source: "fresh", hash, version };
}

async function ensurePlaylistPack(db: IDBDatabase, playlistId: string): Promise<{ source: DataSource; hash: string; pack: PlaylistPackAsset }> {
  const version = 1;
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
      batteryVersion: defaultBaseBatteryVersion,
    },
    rounds,
  };
}

export async function loadGamePack(
  roomId: string,
  playlistIds: string[] = [...defaultPlaylistIds],
): Promise<GamePackLoadResult> {
  try {
    const db = await openCatalogDb();
    const safePlaylistIds = playlistIds.length > 0 ? playlistIds : [...defaultPlaylistIds];
    const baseBatteryVersion = await resolveBaseBatteryVersion();
    const battery = await ensureBaseBattery(db, baseBatteryVersion);
    const playlistResults = await Promise.all(safePlaylistIds.map((playlistId) => ensurePlaylistPack(db, playlistId)));

    const allRounds = playlistResults.flatMap((result) => result.pack.rounds);
    const dedupedRounds = Array.from(new Map(allRounds.map((round) => [round.roundId, round] as const)).values());
    const combinedHash = stableHash({
      batteryHash: battery.hash,
      packs: playlistResults.map((result) => result.hash).sort(),
      roundIds: dedupedRounds.map((round) => round.roundId),
    });

    const sources = [battery.source, ...playlistResults.map((result) => result.source)];
    const source: GamePackLoadResult["source"] =
      sources.every((item) => item === "cache")
        ? "cache"
        : sources.every((item) => item === "fresh")
          ? "fresh"
          : "mixed";

    db.close();
    return {
      pack: {
        meta: {
          version: 1,
          roomId,
          hash: combinedHash,
          createdAt: Date.now(),
          roundCount: dedupedRounds.length,
          playlistIds: safePlaylistIds,
          batteryVersion: battery.version,
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
  }
}
