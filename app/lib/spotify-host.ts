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
  debugMessages: string[];
};

type SpotifyControls = {
  initialize: () => Promise<boolean>;
  playTrack: (trackUri: string, startMs?: number) => Promise<boolean>;
  pause: () => Promise<void>;
  disconnect: () => void;
};

type SpotifyHookResult = SpotifyStatus & SpotifyControls;
type SpotifyAvailableDevice = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
};

let sdkPromise: Promise<void> | null = null;
const SDK_SCRIPT_ID = "spotify-player-sdk";
const DEBUG_LOG_LIMIT = 50;
const READY_WAIT_MS = 5_000;
const READY_POLL_MS = 100;
const INITIALIZE_MAX_ATTEMPTS = 2;
const NOT_READY_GRACE_MS = 1_200;
const PLAYBACK_ERROR_WINDOW_MS = 4_500;
const PLAYBACK_ERROR_BURST_COUNT = 4;
const DEVICE_BLOCK_MS = 90_000;

function nowStamp() {
  const now = new Date();
  return now.toLocaleTimeString("en-US", { hour12: false });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
    const previousReadyHandler = window.onSpotifyWebPlaybackSDKReady;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const settleResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve();
    };

    const settleReject = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      sdkPromise = null;
      reject(error);
    };

    window.onSpotifyWebPlaybackSDKReady = () => {
      previousReadyHandler?.();
      settleResolve();
    };

    const existingScript = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", settleResolve, { once: true });
      existingScript.addEventListener(
        "error",
        () => settleReject(new Error("Could not load Spotify Web Playback SDK.")),
        { once: true },
      );
    } else {
      const script = document.createElement("script");
      script.id = SDK_SCRIPT_ID;
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.onerror = () => settleReject(new Error("Could not load Spotify Web Playback SDK."));
      (document.body ?? document.head).appendChild(script);
    }

    timeoutId = setTimeout(() => {
      settleReject(new Error("Timed out waiting for Spotify SDK to become ready."));
    }, 15_000);
  });

  return sdkPromise;
}

export function useSpotifyHostPlayer(accessToken: string): SpotifyHookResult {
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const tokenRef = useRef(accessToken);
  const initializeInFlightRef = useRef<Promise<boolean> | null>(null);
  const activateDeviceInFlightRef = useRef<Promise<boolean> | null>(null);
  const playTrackInFlightRef = useRef<Promise<boolean> | null>(null);
  const playerInstanceSeqRef = useRef(0);
  const activePlayerInstanceRef = useRef<number | null>(null);
  const pendingNotReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = useRef(false);
  const deviceIdRef = useRef<string | null>(null);
  const lastPlayerStateRef = useRef<string>("");
  const recentPlaybackErrorTsRef = useRef<number[]>([]);
  const blockedDeviceIdsRef = useRef<Map<string, number>>(new Map());
  const preferExternalDeviceUntilRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugMessages, setDebugMessages] = useState<string[]>([]);

  const logDebug = useCallback((message: string) => {
    const entry = `[${nowStamp()}] ${message}`;
    setDebugMessages((current) => {
      const next = [...current, entry];
      return next.length <= DEBUG_LOG_LIMIT ? next : next.slice(next.length - DEBUG_LOG_LIMIT);
    });
  }, []);

  const resetPlayerState = useCallback(
    (reason: string, disconnectPlayer = true) => {
      if (pendingNotReadyTimerRef.current) {
        clearTimeout(pendingNotReadyTimerRef.current);
        pendingNotReadyTimerRef.current = null;
      }

      if (disconnectPlayer) {
        try {
          playerRef.current?.disconnect();
        } catch {
          // Ignore disconnect errors when force-resetting player state.
        }
      }

      playerRef.current = null;
      activePlayerInstanceRef.current = null;
      readyRef.current = false;
      deviceIdRef.current = null;
      activateDeviceInFlightRef.current = null;
      playTrackInFlightRef.current = null;
      recentPlaybackErrorTsRef.current = [];
      blockedDeviceIdsRef.current.clear();
      preferExternalDeviceUntilRef.current = 0;
      setConnected(false);
      setReady(false);
      setDeviceId(null);
      lastPlayerStateRef.current = "";
      logDebug(`player: reset (${reason}).`);
    },
    [logDebug],
  );

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    return () => {
      resetPlayerState("hook unmount", true);
      initializeInFlightRef.current = null;
    };
  }, [resetPlayerState]);

  useEffect(() => {
    void loadSpotifySdk().catch(() => {
      logDebug("SDK pre-load failed; initialize() will retry.");
    });
  }, [logDebug]);

  const initialize = useCallback(async () => {
    if (initializeInFlightRef.current) {
      logDebug("initialize: already in progress, waiting for existing call.");
      return initializeInFlightRef.current;
    }

    const runInitialization = async () => {
      const trimmedToken = tokenRef.current.trim();
      if (!trimmedToken) {
        const message = "Missing Spotify access token. Add it in host setup first.";
        setError(message);
        logDebug("initialize: missing access token.");
        return false;
      }

      setError(null);
      logDebug("initialize: loading SDK.");

      try {
        await loadSpotifySdk();
      } catch (sdkError) {
        const message = sdkError instanceof Error ? sdkError.message : "Could not load Spotify Web Playback SDK.";
        setError(message);
        logDebug(`initialize: SDK load failed (${message}).`);
        return false;
      }

      if (!window.Spotify) {
        setError("Spotify SDK did not initialize.");
        logDebug("initialize: window.Spotify missing after SDK load.");
        return false;
      }

      const createPlayer = () => {
        const spotifyApi = window.Spotify;
        if (!spotifyApi) {
          return false;
        }

        if (pendingNotReadyTimerRef.current) {
          clearTimeout(pendingNotReadyTimerRef.current);
          pendingNotReadyTimerRef.current = null;
        }

        logDebug("initialize: creating Spotify.Player instance.");
        const instanceId = ++playerInstanceSeqRef.current;
        const player = new spotifyApi.Player({
          name: "ChronoJam Host Player",
          getOAuthToken: (cb) => cb(tokenRef.current),
          volume: 0.85,
        });
        activePlayerInstanceRef.current = instanceId;

        player.addListener("ready", ({ device_id }) => {
          if (activePlayerInstanceRef.current !== instanceId) {
            logDebug(`event: ready ignored from stale player#${instanceId}`);
            return;
          }

          if (pendingNotReadyTimerRef.current) {
            clearTimeout(pendingNotReadyTimerRef.current);
            pendingNotReadyTimerRef.current = null;
          }

          readyRef.current = true;
          deviceIdRef.current = device_id;
          recentPlaybackErrorTsRef.current = [];
          setDeviceId(device_id);
          setReady(true);
          setConnected(true);
          logDebug(`event: ready device_id=${device_id} player#${instanceId}`);
        });

        player.addListener("not_ready", ({ device_id }) => {
          if (activePlayerInstanceRef.current !== instanceId) {
            logDebug(`event: not_ready ignored from stale player#${instanceId}`);
            return;
          }

          if (pendingNotReadyTimerRef.current) {
            clearTimeout(pendingNotReadyTimerRef.current);
            pendingNotReadyTimerRef.current = null;
          }

          const seenDeviceId = String(device_id ?? "unknown");
          logDebug(`event: not_ready device_id=${seenDeviceId} player#${instanceId} (grace window started)`);
          pendingNotReadyTimerRef.current = setTimeout(() => {
            if (activePlayerInstanceRef.current !== instanceId) {
              return;
            }

            readyRef.current = false;
            deviceIdRef.current = null;
            setConnected(false);
            setReady(false);
            setDeviceId(null);
            activateDeviceInFlightRef.current = null;
            logDebug(`event: not_ready committed device_id=${seenDeviceId} player#${instanceId}`);
          }, NOT_READY_GRACE_MS);
        });

        player.addListener("initialization_error", ({ message }) => {
          if (activePlayerInstanceRef.current !== instanceId) {
            return;
          }
          const nextMessage = message ?? "Spotify SDK initialization failed.";
          setError(nextMessage);
          logDebug(`event: initialization_error ${nextMessage}`);
        });

        player.addListener("authentication_error", ({ message }) => {
          if (activePlayerInstanceRef.current !== instanceId) {
            return;
          }
          const nextMessage = message ?? "Spotify authentication failed.";
          setError(nextMessage);
          logDebug(`event: authentication_error ${nextMessage}`);
        });

        player.addListener("account_error", ({ message }) => {
          if (activePlayerInstanceRef.current !== instanceId) {
            return;
          }
          const nextMessage = message ?? "Spotify Premium account required.";
          setError(nextMessage);
          logDebug(`event: account_error ${nextMessage}`);
        });

        player.addListener("playback_error", ({ message }) => {
          if (activePlayerInstanceRef.current !== instanceId) {
            return;
          }
          const now = Date.now();
          const recent = [...recentPlaybackErrorTsRef.current, now].filter(
            (timestamp) => now - timestamp <= PLAYBACK_ERROR_WINDOW_MS,
          );
          recentPlaybackErrorTsRef.current = recent;

          const nextMessage = message ?? "Spotify playback error.";
          const currentDeviceId = deviceIdRef.current;
          logDebug(
            `event: playback_error ${nextMessage}${currentDeviceId ? ` device_id=${currentDeviceId}` : ""} burst=${recent.length}`,
          );

          if (!currentDeviceId || recent.length < PLAYBACK_ERROR_BURST_COUNT) {
            return;
          }

          blockedDeviceIdsRef.current.set(currentDeviceId, now + DEVICE_BLOCK_MS);
          preferExternalDeviceUntilRef.current = now + DEVICE_BLOCK_MS;
          setError("Spotify web player is unstable in this browser. Switching to another Spotify device.");
          logDebug(`device: blocked unstable device ${currentDeviceId} for ${DEVICE_BLOCK_MS}ms.`);
        });

        player.addListener("player_state_changed", (state) => {
          if (activePlayerInstanceRef.current !== instanceId) {
            return;
          }
          const trackUri = state?.track_window?.current_track?.uri ?? "unknown";
          const paused = Boolean(state?.paused);
          const key = `${trackUri}|${paused ? "paused" : "playing"}`;
          if (lastPlayerStateRef.current === key) {
            return;
          }
          lastPlayerStateRef.current = key;
          logDebug(`event: player_state_changed ${paused ? "paused" : "playing"} ${trackUri}`);
        });

        playerRef.current = player;
        return true;
      };

      const waitForReady = async () => {
        if (readyRef.current && deviceIdRef.current) {
          return true;
        }

        const deadline = Date.now() + READY_WAIT_MS;
        while (Date.now() < deadline) {
          if (readyRef.current && deviceIdRef.current) {
            return true;
          }
          await sleep(READY_POLL_MS);
        }

        return Boolean(readyRef.current && deviceIdRef.current);
      };

      for (let attempt = 1; attempt <= INITIALIZE_MAX_ATTEMPTS; attempt += 1) {
        if (!playerRef.current) {
          const created = createPlayer();
          if (!created || !playerRef.current) {
            setError("Spotify SDK did not initialize.");
            logDebug("initialize: could not create Spotify.Player.");
            return false;
          }
        }

        if (readyRef.current && deviceIdRef.current) {
          setConnected(true);
          logDebug(`initialize: already ready on device ${deviceIdRef.current}.`);
          return true;
        }

        const player = playerRef.current;
        if (!player) {
          setError("Spotify SDK did not initialize.");
          logDebug("initialize: player missing before connect.");
          return false;
        }

        if (typeof player.activateElement === "function") {
          try {
            await player.activateElement();
            logDebug("initialize: activateElement succeeded.");
          } catch {
            logDebug("initialize: activateElement failed or blocked (non-fatal).");
          }
        }

        logDebug(`initialize: calling player.connect() (attempt ${attempt}/${INITIALIZE_MAX_ATTEMPTS}).`);
        let ok = await player.connect();
        if (!ok && readyRef.current && Boolean(deviceIdRef.current)) {
          ok = true;
        }

        if (!ok) {
                if (attempt < INITIALIZE_MAX_ATTEMPTS) {
                  logDebug("initialize: player.connect() returned false, retrying with fresh player.");
                  resetPlayerState("initialize retry after connect failed", true);
                  continue;
                }

          const message = "Could not connect Spotify player. Use Refresh Token in host controls, then retry Init SDK.";
          setError(message);
          logDebug("initialize: player.connect() returned false.");
          return false;
        }

        setConnected(true);
        logDebug("initialize: player connected, waiting for ready event.");
        const becameReady = await waitForReady();
        if (becameReady && deviceIdRef.current) {
          logDebug(`initialize: ready confirmed on device ${deviceIdRef.current}.`);
          return true;
        }

        if (attempt < INITIALIZE_MAX_ATTEMPTS) {
          logDebug("initialize: ready event timeout, retrying with fresh player.");
          resetPlayerState("initialize retry after ready timeout", true);
          continue;
        }
      }

      setError("Spotify player connected but did not become ready. Retry Init SDK or reconnect Spotify.");
      logDebug("initialize: failed because ready event never arrived.");
      return false;
    };

    initializeInFlightRef.current = runInitialization().finally(() => {
      initializeInFlightRef.current = null;
    });

    return initializeInFlightRef.current;
  }, [logDebug, resetPlayerState]);

  const spotifyPut = useCallback(
    async (path: string, body?: unknown) => {
      if (!tokenRef.current) {
        logDebug(`spotifyPut: blocked ${path} (missing token).`);
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
    [logDebug],
  );

  const spotifyGet = useCallback(
    async (path: string) => {
      if (!tokenRef.current) {
        logDebug(`spotifyGet: blocked ${path} (missing token).`);
        return { ok: false, status: 401, response: null as Response | null };
      }

      const response = await fetch(`https://api.spotify.com/v1${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
        },
      });

      return { ok: response.ok, status: response.status, response };
    },
    [logDebug],
  );

  const logAvailableDevices = useCallback(
    async (contextLabel: string) => {
      const { ok, status, response } = await spotifyGet("/me/player/devices");
      if (!ok || !response) {
        logDebug(`${contextLabel}: could not read devices (${status}).`);
        return [] as SpotifyAvailableDevice[];
      }

      try {
        const payload = (await response.json()) as {
          devices?: Array<{
            id?: string;
            is_active?: boolean;
            type?: string;
            name?: string;
            is_restricted?: boolean;
          }>;
        };
        const devices = (payload.devices ?? [])
          .filter((device): device is { id: string; is_active?: boolean; type?: string; name?: string; is_restricted?: boolean } =>
            Boolean(device.id),
          )
          .filter((device) => !device.is_restricted)
          .map((device) => ({
            id: device.id,
            isActive: Boolean(device.is_active),
            type: device.type ?? "unknown",
            name: device.name ?? "unknown",
          }));
        const summary = devices
          .slice(0, 4)
          .map((device) => `${device.id}:${device.isActive ? "active" : "idle"}:${device.type}:${device.name}`)
          .join(", ");
        logDebug(`${contextLabel}: devices=${devices.length}${summary ? ` [${summary}]` : ""}`);
        return devices;
      } catch {
        logDebug(`${contextLabel}: devices response parse failed.`);
        return [] as SpotifyAvailableDevice[];
      }
    },
    [logDebug, spotifyGet],
  );

  const pickFallbackDevice = useCallback((devices: SpotifyAvailableDevice[], preferExternalDevice: boolean) => {
    const isChronoJamDevice = (device: SpotifyAvailableDevice) => device.name.toLowerCase().includes("chronojam");

    if (preferExternalDevice) {
      const externalActive = devices.find((device) => !isChronoJamDevice(device) && device.isActive);
      if (externalActive) {
        return externalActive;
      }

      const externalSpeaker = devices.find(
        (device) => !isChronoJamDevice(device) && device.type.toLowerCase() === "speaker",
      );
      if (externalSpeaker) {
        return externalSpeaker;
      }

      const anyExternal = devices.find((device) => !isChronoJamDevice(device));
      if (anyExternal) {
        return anyExternal;
      }
    }

    const chronoJam = devices.find((device) => isChronoJamDevice(device));
    if (chronoJam) {
      return chronoJam;
    }

    const active = devices.find((device) => device.isActive);
    if (active) {
      return active;
    }

    const computer = devices.find((device) => device.type.toLowerCase() === "computer");
    if (computer) {
      return computer;
    }

    return devices[0] ?? null;
  }, []);

  const resolvePlayableDeviceId = useCallback(
    async (preferredDeviceId: string | null, contextLabel: string) => {
      const devices = await logAvailableDevices(contextLabel);
      if (devices.length === 0) {
        return preferredDeviceId;
      }

      const now = Date.now();
      for (const [blockedDeviceId, expiresAt] of blockedDeviceIdsRef.current.entries()) {
        if (expiresAt <= now) {
          blockedDeviceIdsRef.current.delete(blockedDeviceId);
        }
      }

      const filteredDevices = devices.filter((device) => {
        const blockedUntil = blockedDeviceIdsRef.current.get(device.id);
        return !blockedUntil || blockedUntil <= now;
      });
      const candidateDevices = filteredDevices.length > 0 ? filteredDevices : devices;
      const preferExternalDevice = preferExternalDeviceUntilRef.current > now;

      if (
        preferredDeviceId &&
        candidateDevices.some((device) => device.id === preferredDeviceId) &&
        !preferExternalDevice
      ) {
        return preferredDeviceId;
      }

      const fallback = pickFallbackDevice(candidateDevices, preferExternalDevice);
      if (!fallback) {
        return preferredDeviceId;
      }

      if (fallback.id !== preferredDeviceId) {
        logDebug(
          `device: switching from ${preferredDeviceId ?? "none"} to ${fallback.id} (${fallback.type}:${fallback.name}).`,
        );
        deviceIdRef.current = fallback.id;
        setDeviceId(fallback.id);
      }

      readyRef.current = true;
      setReady(true);
      setConnected(true);
      return fallback.id;
    },
    [logAvailableDevices, logDebug, pickFallbackDevice],
  );

  const readSpotifyErrorDetail = useCallback(async (response: Response | null) => {
    if (!response) {
      return "";
    }

    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      if (payload?.error?.message) {
        return payload.error.message;
      }
    } catch {
      // Ignore parse failures and fallback to an empty detail.
    }

    return "";
  }, []);

  const activateDevice = useCallback(
    async (targetDeviceId: string) => {
      if (!tokenRef.current || !targetDeviceId) {
        logDebug("activateDevice: missing token or device id.");
        return false;
      }

      if (activateDeviceInFlightRef.current) {
        return activateDeviceInFlightRef.current;
      }

      const runActivation = async () => {
        let effectiveDeviceId = targetDeviceId;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const routedDeviceId = await resolvePlayableDeviceId(effectiveDeviceId, `activateDevice resolve ${attempt}`);
          if (!routedDeviceId) {
            setError("No Spotify playback device is available.");
            return false;
          }
          effectiveDeviceId = routedDeviceId;

          logDebug(`activateDevice: transferring playback to ${effectiveDeviceId} (attempt ${attempt}/2).`);
          const { ok, status, response } = await spotifyPut("/me/player", {
            device_ids: [effectiveDeviceId],
            play: false,
          });

          if (ok) {
            logDebug("activateDevice: transfer request accepted.");
            return true;
          }

          const detail = await readSpotifyErrorDetail(response);
          if (status === 404) {
            logDebug(`activateDevice: device missing (${status})${detail ? ` ${detail}` : ""}`);
            await logAvailableDevices("activateDevice 404");
            if (attempt < 2) {
              await sleep(450);
              continue;
            }
            setError("Spotify transfer skipped because device is not yet discoverable.");
            return false;
          }

          const message = `Spotify device activate failed (${status}).${detail ? ` ${detail}` : ""}`;
          setError(message);
          logDebug(`activateDevice: failed (${status})${detail ? ` ${detail}` : ""}`);
          return false;
        }

        return false;
      };

      activateDeviceInFlightRef.current = runActivation().finally(() => {
        activateDeviceInFlightRef.current = null;
      });

      return activateDeviceInFlightRef.current;
    },
    [logAvailableDevices, logDebug, readSpotifyErrorDetail, resolvePlayableDeviceId, spotifyPut],
  );

  const playTrack = useCallback(
    async (trackUri: string, startMs = 0) => {
      if (playTrackInFlightRef.current) {
        logDebug("playTrack: already in progress, waiting for existing call.");
        return playTrackInFlightRef.current;
      }

      const runPlayTrack = async () => {
        const normalizedStartMs = Math.max(0, Math.floor(startMs));
        logDebug(`playTrack: requested ${trackUri} at ${normalizedStartMs}ms.`);

        if (!tokenRef.current.trim()) {
          setError("Connect Spotify player before trying playback.");
          logDebug("playTrack: aborted because token is missing.");
          return false;
        }

        let targetDeviceId = deviceIdRef.current;
        if (!targetDeviceId) {
          logDebug("playTrack: no SDK device id yet; running initialize() (best effort).");
          const initialized = await initialize();
          if (!initialized) {
            logDebug("playTrack: initialize() failed; trying API-visible device fallback.");
          }
          targetDeviceId = deviceIdRef.current;
        }

        targetDeviceId = await resolvePlayableDeviceId(targetDeviceId, "playTrack bootstrap");
        if (!targetDeviceId) {
          setError("No Spotify Connect device is available. Open Spotify on the host device and retry.");
          logDebug("playTrack: no playable device available after bootstrap.");
          return false;
        }
        deviceIdRef.current = targetDeviceId;
        setDeviceId(targetDeviceId);
        setConnected(true);

        const attemptPlay = async (attemptNumber: number, deviceForAttempt: string) => {
          const routedDeviceId = await resolvePlayableDeviceId(deviceForAttempt, `playTrack resolve ${attemptNumber}`);
          if (!routedDeviceId) {
            setError("No Spotify playback device is available.");
            logDebug(`playTrack: attempt ${attemptNumber} aborted (no routable device).`);
            return { ok: false, status: 404 };
          }

          const { ok, status, response } = await spotifyPut(`/me/player/play?device_id=${routedDeviceId}`, {
            uris: [trackUri],
            position_ms: normalizedStartMs,
          });

          if (ok) {
            setError(null);
            logDebug(`playTrack: attempt ${attemptNumber} succeeded.`);
            return { ok: true, status };
          }

          const detail = await readSpotifyErrorDetail(response);
          const baseMessage = `Spotify play failed (${status}). Ensure scopes include streaming and user-modify-playback-state.`;
          setError(`${baseMessage}${detail ? ` ${detail}` : ""}`);
          logDebug(`playTrack: attempt ${attemptNumber} failed (${status})${detail ? ` ${detail}` : ""}`);
          if (status === 404) {
            await logAvailableDevices("playTrack 404");
          }
          return { ok: false, status };
        };

        const activated = await activateDevice(targetDeviceId);
        if (!activated) {
          logDebug("playTrack: activation failed; continuing with direct play fallback.");
        }

        await sleep(220);
        const firstAttempt = await attemptPlay(1, targetDeviceId);
        if (firstAttempt.ok) {
          return true;
        }

        if (firstAttempt.status === 404) {
          logDebug("playTrack: device missing on play; attempting full reinitialize.");
          await initialize();
          const recoveredDeviceId = await resolvePlayableDeviceId(deviceIdRef.current, "playTrack recover route");
          if (!recoveredDeviceId) {
            logDebug("playTrack: reinitialize fallback could not find any playable device.");
            return false;
          }

          await sleep(420);
          const recoveredAttempt = await attemptPlay(2, recoveredDeviceId);
          if (recoveredAttempt.ok) {
            return true;
          }

          logDebug("playTrack: retrying once more after optional transfer.");
          await activateDevice(recoveredDeviceId);
          await sleep(500);
          const finalAttempt = await attemptPlay(3, recoveredDeviceId);
          return finalAttempt.ok;
        }

        logDebug("playTrack: retrying after optional transfer.");
        await activateDevice(targetDeviceId);
        await sleep(460);
        const secondAttempt = await attemptPlay(2, targetDeviceId);
        return secondAttempt.ok;
      };

      playTrackInFlightRef.current = runPlayTrack().finally(() => {
        playTrackInFlightRef.current = null;
      });

      return playTrackInFlightRef.current;
    },
    [activateDevice, initialize, logAvailableDevices, logDebug, readSpotifyErrorDetail, resolvePlayableDeviceId, spotifyPut],
  );

  const pause = useCallback(async () => {
    if (!tokenRef.current) {
      logDebug("pause: ignored (missing token).");
      return;
    }

    let currentDeviceId = deviceIdRef.current;
    if (!currentDeviceId) {
      currentDeviceId = await resolvePlayableDeviceId(null, "pause bootstrap");
      if (!currentDeviceId) {
        logDebug("pause: ignored (no playable device).");
        return;
      }
      deviceIdRef.current = currentDeviceId;
      setDeviceId(currentDeviceId);
    }

    const { ok, status, response } = await spotifyPut(`/me/player/pause?device_id=${currentDeviceId}`);
    if (!ok) {
      const detail = await readSpotifyErrorDetail(response);
      logDebug(`pause: failed (${status})${detail ? ` ${detail}` : ""}`);
      if (status === 404) {
        logDebug("pause: device not found; treating as non-fatal.");
        await logAvailableDevices("pause 404");
        setError(null);
      }
      return;
    }

    logDebug("pause: success.");
  }, [logAvailableDevices, logDebug, readSpotifyErrorDetail, resolvePlayableDeviceId, spotifyPut]);

  const disconnect = useCallback(() => {
    resetPlayerState("manual disconnect", true);
    initializeInFlightRef.current = null;
    logDebug("disconnect: player disconnected.");
  }, [logDebug, resetPlayerState]);

  return useMemo(
    () => ({
      ready,
      connected,
      deviceId,
      error,
      debugMessages,
      initialize,
      playTrack,
      pause,
      disconnect,
    }),
    [connected, debugMessages, deviceId, disconnect, error, initialize, pause, playTrack, ready],
  );
}
