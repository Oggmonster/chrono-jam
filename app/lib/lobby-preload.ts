import { useEffect, useMemo, useState } from "react";

import {
  loadCatalogAutocompletePack,
  loadGamePack,
  type GamePackLoadResult,
} from "~/lib/gamepack";

type PreloadSource = GamePackLoadResult["source"] | "none";

export type LobbyPreloadState = {
  gamePackLoaded: boolean;
  autocompleteLoaded: boolean;
  gamePackHash: string;
  gamePackSource: PreloadSource;
  loading: boolean;
  error: string;
  ready: boolean;
};

function initialState(): LobbyPreloadState {
  return {
    gamePackLoaded: false,
    autocompleteLoaded: false,
    gamePackHash: "",
    gamePackSource: "none",
    loading: false,
    error: "",
    ready: false,
  };
}

function normalizePlaylistIds(playlistIds: string[]) {
  const sanitized = playlistIds
    .map((playlistId) => playlistId.trim())
    .filter((playlistId) => playlistId.length > 0);
  return [...new Set(sanitized)];
}

export function useLobbyPreload(roomId: string, enabled: boolean, playlistIds: string[]): LobbyPreloadState {
  const [state, setState] = useState<LobbyPreloadState>(() => initialState());
  const playlistKey = useMemo(() => JSON.stringify(normalizePlaylistIds(playlistIds)), [playlistIds]);

  useEffect(() => {
    if (!enabled) {
      setState(initialState());
      return;
    }

    let cancelled = false;
    setState((prev) => ({
      ...initialState(),
      loading: true,
      gamePackHash: prev.gamePackHash,
      gamePackSource: prev.gamePackSource,
    }));

    const run = async () => {
      try {
        const resolvedPlaylistIds = JSON.parse(playlistKey) as string[];
        const loaded = await loadGamePack(roomId, resolvedPlaylistIds);
        if (cancelled) {
          return;
        }

        setState((prev) => ({
          ...prev,
          gamePackLoaded: true,
          gamePackHash: loaded.pack.meta.hash,
          gamePackSource: loaded.source,
        }));

        await loadCatalogAutocompletePack(loaded.pack.meta.hash);
        if (cancelled) {
          return;
        }

        setState((prev) => ({
          ...prev,
          autocompleteLoaded: true,
          loading: false,
        }));
      } catch {
        if (cancelled) {
          return;
        }

        setState({
          ...initialState(),
          error: "Preload failed. Refresh and retry.",
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled, playlistKey, roomId]);

  const ready = useMemo(
    () => state.gamePackLoaded && state.autocompleteLoaded,
    [state.autocompleteLoaded, state.gamePackLoaded],
  );

  return {
    ...state,
    ready,
  };
}
