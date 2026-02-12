import { useCallback, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
  }
}

type SpotifyPlayer = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (payload: any) => void) => void;
  removeListener: (event: string, callback?: (payload: any) => void) => void;
};

type SpotifyStatus = {
  ready: boolean;
  connected: boolean;
  deviceId: string | null;
  error: string | null;
};

type SpotifyControls = {
  initialize: () => Promise<void>;
  playTrack: (trackUri: string, startMs?: number) => Promise<void>;
  pause: () => Promise<void>;
  disconnect: () => void;
};

type SpotifyHookResult = SpotifyStatus & SpotifyControls;

let sdkPromise: Promise<void> | null = null;

function loadSpotifySdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.Spotify) {
    return Promise.resolve();
  }

  if (sdkPromise) {
    return sdkPromise;
  }

  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;

    script.onerror = () => reject(new Error("Could not load Spotify Web Playback SDK."));

    window.onSpotifyWebPlaybackSDKReady = () => {
      resolve();
    };

    document.body.appendChild(script);
  });

  return sdkPromise;
}

export function useSpotifyHostPlayer(accessToken: string): SpotifyHookResult {
  const playerRef = useRef<SpotifyPlayer | null>(null);

  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    if (!accessToken) {
      setError("Missing Spotify access token. Add it in host setup first.");
      return;
    }

    setError(null);

    await loadSpotifySdk();

    if (!window.Spotify) {
      setError("Spotify SDK did not initialize.");
      return;
    }

    if (!playerRef.current) {
      const player = new window.Spotify.Player({
        name: "ChronoJam Host Player",
        getOAuthToken: (cb) => cb(accessToken),
        volume: 0.85,
      });

      player.addListener("ready", ({ device_id }) => {
        setDeviceId(device_id);
        setReady(true);
      });

      player.addListener("not_ready", () => {
        setConnected(false);
      });

      player.addListener("initialization_error", ({ message }) => {
        setError(message ?? "Spotify SDK initialization failed.");
      });

      player.addListener("authentication_error", ({ message }) => {
        setError(message ?? "Spotify authentication failed.");
      });

      player.addListener("account_error", ({ message }) => {
        setError(message ?? "Spotify Premium account required.");
      });

      player.addListener("playback_error", ({ message }) => {
        setError(message ?? "Spotify playback error.");
      });

      playerRef.current = player;
    }

    const ok = await playerRef.current.connect();
    setConnected(ok);

    if (!ok) {
      setError("Could not connect Spotify player.");
    }
  }, [accessToken]);

  const playTrack = useCallback(
    async (trackUri: string, startMs = 0) => {
      if (!accessToken || !deviceId) {
        setError("Connect Spotify player before trying playback.");
        return;
      }

      const response = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uris: [trackUri],
            position_ms: startMs,
          }),
        },
      );

      if (!response.ok) {
        setError(`Spotify play failed (${response.status}). Ensure scopes include streaming and user-modify-playback-state.`);
      }
    },
    [accessToken, deviceId],
  );

  const pause = useCallback(async () => {
    if (!accessToken || !deviceId) {
      return;
    }

    await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }, [accessToken, deviceId]);

  const disconnect = useCallback(() => {
    playerRef.current?.disconnect();
    setConnected(false);
    setReady(false);
    setDeviceId(null);
  }, []);

  return useMemo(
    () => ({
      ready,
      connected,
      deviceId,
      error,
      initialize,
      playTrack,
      pause,
      disconnect,
    }),
    [connected, deviceId, disconnect, error, initialize, pause, playTrack, ready],
  );
}
