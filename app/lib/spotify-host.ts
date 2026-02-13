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
  const readyRef = useRef(false);
  const deviceIdRef = useRef<string | null>(null);

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
    if (!tokenRef.current.trim()) {
      setError("Missing Spotify access token. Add it in host setup first.");
      return false;
    }

    setError(null);

    try {
      await loadSpotifySdk();
    } catch {
      setError("Could not load Spotify Web Playback SDK.");
      return false;
    }

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
        readyRef.current = true;
        deviceIdRef.current = device_id;
        setDeviceId(device_id);
        setReady(true);
        setConnected(true);
      });

      player.addListener("not_ready", () => {
        readyRef.current = false;
        deviceIdRef.current = null;
        setConnected(false);
        setReady(false);
        setDeviceId(null);
        activatingDeviceRef.current = null;
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

    let ok = await playerRef.current.connect();
    if (!ok && readyRef.current && Boolean(deviceIdRef.current)) {
      ok = true;
    }
    setConnected((current) => current || ok);

    if (!ok) {
      setError("Could not connect Spotify player. Use Refresh Token in host controls, then retry Init SDK.");
      return false;
    }

    return true;
  }, []);

  const spotifyPut = useCallback(
    async (path: string, body?: unknown) => {
      if (!tokenRef.current) {
        return { ok: false, status: 401, response: null as Response | null };
      }

      const response = await fetch(`https://api.spotify.com/v1${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      return { ok: response.ok, status: response.status, response };
    },
    [],
  );

  const activateDevice = useCallback(async (targetDeviceId: string) => {
    if (!tokenRef.current || !targetDeviceId) {
      return;
    }

    if (activatingDeviceRef.current === targetDeviceId) {
      return;
    }

    activatingDeviceRef.current = targetDeviceId;
    const { ok, status } = await spotifyPut("/me/player", {
      device_ids: [targetDeviceId],
      play: false,
    });

    if (!ok) {
      activatingDeviceRef.current = null;
      setError(`Spotify device activate failed (${status}).`);
    }
  }, [spotifyPut]);

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

      const { ok, status, response } = await spotifyPut(`/me/player/play?device_id=${deviceId}`, {
        uris: [trackUri],
        position_ms: startMs,
      });

      if (!ok) {
        let errorDetail = "";
        if (response) {
          try {
            const payload = (await response.json()) as { error?: { message?: string } };
            if (payload?.error?.message) {
              errorDetail = ` ${payload.error.message}`;
            }
          } catch {
            // Ignore parse failures.
          }
        }

        setError(
          `Spotify play failed (${status}). Ensure scopes include streaming and user-modify-playback-state.${errorDetail}`,
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

    await spotifyPut(`/me/player/pause?device_id=${deviceId}`);
  }, [deviceId, spotifyPut]);

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
