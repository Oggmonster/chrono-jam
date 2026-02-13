import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  activateElement?: () => Promise<void> | void;
};

type SpotifyStatus = {
  ready: boolean;
  connected: boolean;
  deviceId: string | null;
  error: string | null;
};

type SpotifyControls = {
  initialize: () => Promise<boolean>;
  playTrack: (trackUri: string, startMs?: number) => Promise<boolean>;
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
  const tokenRef = useRef(accessToken);
  const activatingDeviceRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    void loadSpotifySdk().catch(() => {
      // SDK can still be retried on initialize.
    });
  }, []);

  const initialize = useCallback(async () => {
    if (!accessToken) {
      setError("Missing Spotify access token. Add it in host setup first.");
      return false;
    }

    setError(null);

    await loadSpotifySdk();

    if (!window.Spotify) {
      setError("Spotify SDK did not initialize.");
      return false;
    }

    if (!playerRef.current) {
      const player = new window.Spotify.Player({
        name: "ChronoJam Host Player",
        getOAuthToken: (cb) => cb(tokenRef.current),
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

    if (typeof playerRef.current.activateElement === "function") {
      try {
        await playerRef.current.activateElement();
      } catch {
        // Non-fatal; some environments do not support explicit activation.
      }
    }

    const ok = await playerRef.current.connect();
    setConnected(ok);

    if (!ok) {
      setError("Could not connect Spotify player.");
      return false;
    }

    return true;
  }, [accessToken]);

  const activateDevice = useCallback(async (targetDeviceId: string) => {
    if (!tokenRef.current || !targetDeviceId) {
      return;
    }

    if (activatingDeviceRef.current === targetDeviceId) {
      return;
    }

    activatingDeviceRef.current = targetDeviceId;
    const response = await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenRef.current}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_ids: [targetDeviceId],
        play: false,
      }),
    });

    if (!response.ok) {
      activatingDeviceRef.current = null;
      setError(`Spotify device activate failed (${response.status}).`);
    }
  }, []);

  useEffect(() => {
    if (!connected || !deviceId) {
      return;
    }

    void activateDevice(deviceId);
  }, [activateDevice, connected, deviceId]);

  const playTrack = useCallback(
    async (trackUri: string, startMs = 0) => {
      if (!tokenRef.current || !deviceId) {
        setError("Connect Spotify player before trying playback.");
        return false;
      }

      await activateDevice(deviceId);

      const response = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${tokenRef.current}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uris: [trackUri],
            position_ms: startMs,
          }),
        },
      );

      if (!response.ok) {
        let errorDetail = "";
        try {
          const payload = (await response.json()) as { error?: { message?: string } };
          if (payload?.error?.message) {
            errorDetail = ` ${payload.error.message}`;
          }
        } catch {
          // Ignore parse failures.
        }

        setError(
          `Spotify play failed (${response.status}). Ensure scopes include streaming and user-modify-playback-state.${errorDetail}`,
        );
        return false;
      }

      setError(null);
      return true;
    },
    [activateDevice, deviceId],
  );

  const pause = useCallback(async () => {
    if (!tokenRef.current || !deviceId) {
      return;
    }

    await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenRef.current}`,
      },
    });
  }, [deviceId]);

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
