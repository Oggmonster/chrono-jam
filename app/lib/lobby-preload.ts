import { useEffect, useMemo, useState } from "react";

import { loadGamePack, type GamePackLoadResult } from "~/lib/gamepack";

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

const preloadStepDelayMs = {
  autocomplete: 120,
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

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

export function useLobbyPreload(roomId: string, enabled: boolean): LobbyPreloadState {
  const [state, setState] = useState<LobbyPreloadState>(() => initialState());

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
        const loaded = await loadGamePack(roomId);
        if (cancelled) {
          return;
        }

        setState((prev) => ({
          ...prev,
          gamePackLoaded: true,
          gamePackHash: loaded.pack.meta.hash,
          gamePackSource: loaded.source,
        }));

        await wait(preloadStepDelayMs.autocomplete);
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
  }, [enabled, roomId]);

  const ready = useMemo(
    () => state.gamePackLoaded && state.autocompleteLoaded,
    [state.autocompleteLoaded, state.gamePackLoaded],
  );

  return {
    ...state,
    ready,
  };
}
