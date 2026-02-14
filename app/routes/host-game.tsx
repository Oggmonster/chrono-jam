import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/host-game";
import { Link } from "react-router";
import { FastForward, Home, Pause, Play, Radio, RotateCcw, SkipForward, Wifi } from "lucide-react";

import { CatMascot, Equalizer, GameCard, GameLayout, TimerBar } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { phaseDurations, phaseLabel, useRoomState } from "~/lib/game-engine";
import { useSpotifyHostPlayer } from "~/lib/spotify-host";
import {
  readStoredSpotifyToken,
  resolveSpotifyAccessToken,
  refreshSpotifyAccessToken,
  storeSpotifyToken,
} from "~/lib/spotify-token";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Host Game" }];
}

export default function HostGame({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const room = useRoomState(roomId, "host");

  const [token, setToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState("");
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [interactionUnlocked, setInteractionUnlocked] = useState(false);
  const spotify = useSpotifyHostPlayer(token);
  const autoPlayedRef = useRef<string>("");
  const autoInitTokenRef = useRef<string>("");
  const interactionUnlockedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = readStoredSpotifyToken();
    if (stored.accessToken) {
      setToken(stored.accessToken);
      setTokenStatus("Using stored token.");
    }

    let cancelled = false;
    void resolveSpotifyAccessToken()
      .then(({ accessToken, source }) => {
        if (cancelled) {
          return;
        }

        setToken(accessToken);
        setTokenStatus(source === "refresh" ? "Token refreshed." : "Token synced from setup.");
      })
      .catch(() => {
        if (!stored.accessToken) {
          setTokenStatus("Missing token. Reconnect Spotify or paste a valid access token.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncToken = () => {
      void resolveSpotifyAccessToken()
        .then(({ accessToken, source }) => {
          setToken((current) => (current === accessToken ? current : accessToken));
          if (source === "refresh") {
            setTokenStatus("Token auto-refreshed.");
          }
        })
        .catch(() => {
          // Ignore periodic sync failures and keep current token.
        });
    };

    const timer = window.setInterval(syncToken, 20_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      return;
    }

    if (spotify.connected) {
      return;
    }

    if (autoInitTokenRef.current === trimmedToken) {
      return;
    }

    autoInitTokenRef.current = trimmedToken;
    void spotify.initialize();
  }, [spotify.connected, spotify.initialize, token]);

  useEffect(() => {
    const unlockFromInteraction = () => {
      if (interactionUnlockedRef.current) {
        return;
      }

      interactionUnlockedRef.current = true;
      setInteractionUnlocked(true);
      void spotify.initialize();
    };

    window.addEventListener("pointerdown", unlockFromInteraction, { passive: true });
    window.addEventListener("keydown", unlockFromInteraction);

    return () => {
      window.removeEventListener("pointerdown", unlockFromInteraction);
      window.removeEventListener("keydown", unlockFromInteraction);
    };
  }, [spotify.initialize]);

  const progress = useMemo(() => {
    if (room.state.lifecycle !== "running") {
      return 0;
    }

    const total = phaseDurations[room.state.phase];
    if (!total) {
      return 0;
    }

    const elapsed = total - room.remainingMs;
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  }, [room.remainingMs, room.state.lifecycle, room.state.phase]);

  useEffect(() => {
    if (room.state.lifecycle !== "running" || room.state.phase !== "LISTEN") {
      return;
    }

    const autoplayKey = `${room.state.roundIndex}:${room.round.id}:${room.state.phaseStartedAt}`;
    let disposed = false;

    const attemptPlay = async () => {
      if (disposed) {
        return;
      }

      if (autoPlayedRef.current === autoplayKey) {
        return;
      }

      if (!spotify.ready || !spotify.deviceId) {
        await spotify.initialize();
        return;
      }

      const played = await spotify.playTrack(room.round.spotifyUri, room.round.startMs);
      if (played) {
        autoPlayedRef.current = autoplayKey;
      }
    };

    void attemptPlay();
    const retryTimer = window.setInterval(() => {
      void attemptPlay();
    }, 1500);

    return () => {
      disposed = true;
      window.clearInterval(retryTimer);
    };
  }, [
    room.round.id,
    room.round.spotifyUri,
    room.round.startMs,
    room.state.lifecycle,
    room.state.phase,
    room.state.phaseStartedAt,
    spotify.deviceId,
    spotify,
  ]);

  useEffect(() => {
    if (room.state.lifecycle === "running" && room.state.phase === "LISTEN") {
      return;
    }

    if (!spotify.connected) {
      return;
    }

    void spotify.pause();
  }, [room.state.lifecycle, room.state.phase, spotify]);

  const saveToken = () => {
    if (typeof window === "undefined") {
      return;
    }

    storeSpotifyToken(token.trim(), 60 * 60);
    setTokenStatus("Token saved manually.");
  };

  const refreshToken = () => {
    setRefreshingToken(true);
    void refreshSpotifyAccessToken()
      .then(({ accessToken, expiresIn }) => {
        storeSpotifyToken(accessToken, expiresIn);
        setToken(accessToken);
        setTokenStatus("Token refreshed.");
      })
      .catch(() => {
        setTokenStatus("Token refresh failed. Reconnect Spotify.");
      })
      .finally(() => {
        setRefreshingToken(false);
      });
  };

  const remainingSeconds = Math.ceil(room.remainingMs / 1000);
  const leaderboard = [...room.state.participants]
    .map((participant) => ({
      ...participant,
      points: room.state.scores[participant.id] ?? 0,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  return (
    <GameLayout className="mx-auto max-w-3xl">
      <div className="animate-slide-up flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Badge variant="warning">Host Control</Badge>
          <div className="flex items-center gap-2">
            <Badge variant="listening">
              {`Round ${room.state.roundIndex + 1}/${room.state.rounds.length}`}
            </Badge>
            <Badge variant={room.state.phase === "LISTEN" ? "info" : room.state.phase === "REVEAL" ? "success" : "warning"}>
              {phaseLabel(room.state.phase)}
            </Badge>
          </div>
        </div>

        <GameCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-card-foreground">Phase Timer</h3>
            <span className="text-xs font-mono text-muted-foreground">{`Open '/play/game/${roomId}' to verify sync`}</span>
          </div>
          <TimerBar progress={progress} seconds={remainingSeconds} />

          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4" role="status" aria-live="polite">
            {room.state.lifecycle === "running" && room.state.phase === "LISTEN" ? (
              <div className="flex items-center gap-3">
                <CatMascot variant="thinking" size="sm" className="animate-wiggle" />
                <div>
                  <div className="flex items-center gap-2">
                    <Equalizer />
                    <span className="text-sm font-semibold text-card-foreground">Now Listening...</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Song details hidden for fairness</p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xl font-bold text-card-foreground">{room.round.title}</p>
                <p className="font-semibold text-muted-foreground">{room.round.artist}</p>
                <p className="text-sm text-muted-foreground">Year: {room.round.year}</p>
              </div>
            )}
          </div>
        </GameCard>

        <div className="grid gap-4 md:grid-cols-2">
          <GameCard className="p-5">
            <h3 className="mb-4 font-bold text-card-foreground">Round Controls</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="success" onClick={room.controls.startGame}>
                <Play className="h-4 w-4" />
                Start
              </Button>
              <Button onClick={room.controls.skipPhase}>
                <SkipForward className="h-4 w-4" />
                Skip Phase
              </Button>
              <Button variant="outline" onClick={room.controls.resetLobby}>
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
              <Button variant="outline" onClick={room.controls.syncState}>
                <Wifi className="h-4 w-4" />
                Force Sync
              </Button>
            </div>
          </GameCard>

          <GameCard className="p-5">
            <h3 className="mb-4 font-bold text-card-foreground">Spotify Playback</h3>
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-card-foreground">
                <span className={`h-2.5 w-2.5 rounded-full ${spotify.ready ? "bg-[hsl(155_65%_40%)]" : "bg-[hsl(45_95%_52%)]"}`} />
                {spotify.ready ? "Connected & Ready" : "Waiting for ready state"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void spotify.playTrack(room.round.spotifyUri, room.round.startMs)}
                  className="bg-[hsl(200_75%_50%)] text-white hover:bg-[hsl(200_75%_50%/0.9)]"
                >
                  <Play className="h-3.5 w-3.5" />
                  Play Clip
                </Button>
                <Button size="sm" variant="outline" onClick={() => void spotify.pause()}>
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </Button>
              </div>
              <details className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-semibold text-card-foreground">Advanced controls</summary>
                <div className="mt-3 space-y-3">
                  <label className="grid gap-2">
                    Access token
                    <Input
                      type="password"
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      placeholder="Paste OAuth token"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={saveToken}>Save Token</Button>
                    <Button variant="outline" size="sm" onClick={refreshToken}>
                      {refreshingToken ? "Refreshing..." : "Refresh Token"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void spotify.initialize()}>
                      <Radio className="h-3.5 w-3.5" />
                      Init SDK
                    </Button>
                    <Button size="sm" onClick={() => void spotify.playTrack(room.round.spotifyUri, room.round.startMs)}>
                      <FastForward className="h-3.5 w-3.5" />
                      Force Play
                    </Button>
                  </div>
                  <div role="status" aria-live="polite" className="space-y-1 text-xs">
                    <p>Connected: {spotify.connected ? "yes" : "no"}</p>
                    <p>Ready: {spotify.ready ? "yes" : "no"}</p>
                    {!interactionUnlocked ? <p>Tap/click once to unlock browser audio.</p> : null}
                    {tokenStatus ? <p>{tokenStatus}</p> : null}
                    {spotify.error ? <p className="text-[hsl(var(--destructive))]">{spotify.error}</p> : null}
                  </div>
                </div>
              </details>
            </div>
          </GameCard>
        </div>

        <GameCard className="p-5">
          <h3 className="mb-4 font-bold text-card-foreground">Live Leaderboard</h3>
          <div className="stagger-children flex flex-col gap-2">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                  index === 0
                    ? "border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)]"
                    : "border-border bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: entry.color }}
                  >
                    {entry.name.charAt(0)}
                  </div>
                  <span className="font-semibold text-card-foreground">{entry.name}</span>
                </div>
                <span className="font-mono text-lg font-bold text-[hsl(var(--primary))]">{entry.points}</span>
              </div>
            ))}
            {leaderboard.length === 0 ? <p className="text-center text-sm text-muted-foreground">No players in room.</p> : null}
          </div>
        </GameCard>

        <div className="flex justify-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to={`/host/lobby/${roomId}`}>Back To Lobby</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <Home className="h-4 w-4" />
              Home
            </Link>
          </Button>
        </div>
      </div>
    </GameLayout>
  );
}
