import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/host-game";
import { Link } from "react-router";
import { FastForward, Play, Pause, Radio } from "lucide-react";

import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import { phaseDurations, phaseLabel, useRoomState } from "~/lib/game-engine";
import { useSpotifyHostPlayer } from "~/lib/spotify-host";
import {
  isTokenExpiring,
  readStoredSpotifyToken,
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
    }

    if (stored.accessToken && isTokenExpiring(stored.expiresAt)) {
      void refreshSpotifyAccessToken()
        .then(({ accessToken, expiresIn }) => {
          storeSpotifyToken(accessToken, expiresIn);
          setToken(accessToken);
          setTokenStatus("Token refreshed.");
        })
        .catch(() => {
          setTokenStatus("Token refresh failed. Reconnect Spotify.");
        });
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stored = readStoredSpotifyToken();
      if (!stored.accessToken || !isTokenExpiring(stored.expiresAt)) {
        return;
      }

      void refreshSpotifyAccessToken()
        .then(({ accessToken, expiresIn }) => {
          storeSpotifyToken(accessToken, expiresIn);
          setToken(accessToken);
          setTokenStatus("Token refreshed.");
        })
        .catch(() => {
          setTokenStatus("Token refresh failed. Reconnect Spotify.");
        });
    }, 20_000);

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

    const autoplayKey = `${room.round.id}:${room.state.phaseStartedAt}`;
    let disposed = false;

    const attemptPlay = async () => {
      if (disposed) {
        return;
      }

      if (autoPlayedRef.current === autoplayKey) {
        return;
      }

      if (!spotify.connected || !spotify.ready) {
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
    spotify,
  ]);

  useEffect(() => {
    if (room.state.lifecycle === "running" && room.state.phase !== "INTERMISSION") {
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
    void refreshSpotifyAccessToken()
      .then(({ accessToken, expiresIn }) => {
        storeSpotifyToken(accessToken, expiresIn);
        setToken(accessToken);
        setTokenStatus("Token refreshed.");
      })
      .catch(() => {
        setTokenStatus("Token refresh failed. Reconnect Spotify.");
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
    <main className="jam-page">
      <section className="jam-stage w-full max-w-6xl">
        <Ribbon>Host Control Board</Ribbon>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Badge>{room.state.lifecycle.toUpperCase()}</Badge>
          <Badge variant="warning">Round {room.state.roundIndex + 1}</Badge>
          <Badge variant={room.state.phase === "LISTEN" ? "success" : "default"}>
            {phaseLabel(room.state.phase)}
          </Badge>
        </div>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Phase Timer</CardTitle>
            <CardDescription>
              Host is authoritative. Open `/play/game/{roomId}` in another tab to verify synchronization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress} />
            <div className="flex items-center justify-between text-sm font-bold text-[#2d2a77]">
              <span>{phaseLabel(room.state.phase)}</span>
              <span>{room.state.lifecycle === "running" ? `${remainingSeconds}s` : "idle"}</span>
            </div>
            <div className="rounded-2xl border-2 border-[#2f4eb8] bg-[#eef4ff] p-4 text-[#1f1f55]">
              {room.state.lifecycle === "running" && room.state.phase === "LISTEN" ? (
                <>
                  <p className="font-[var(--font-display)] text-2xl text-[#243a84]">Now Listening...</p>
                  <p className="font-bold">Song details hidden for fairness</p>
                  <p className="text-sm">Host playback should start automatically.</p>
                </>
              ) : (
                <>
                  <p className="font-[var(--font-display)] text-2xl text-[#243a84]">{room.round.title}</p>
                  <p className="font-bold">{room.round.artist}</p>
                  <p className="text-sm">Year: {room.round.year}</p>
                  <p className="mt-2 text-xs font-semibold text-[#3e4f91]">{room.round.spotifyUri}</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Round Controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="success" onClick={room.controls.startGame}>
                Start Game
              </Button>
              <Button variant="secondary" onClick={room.controls.skipPhase}>
                <FastForward className="h-4 w-4" />
                Skip Phase
              </Button>
              <Button variant="outline" onClick={room.controls.resetLobby}>
                Reset
              </Button>
              <Button variant="outline" onClick={room.controls.syncState}>
                Force Sync
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spotify Playback SDK</CardTitle>
              <CardDescription>
                Real host playback path for Premium account mode.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="grid gap-2 text-sm font-bold text-[#32277e]">
                Access token
                <Input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Paste OAuth token"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={saveToken}>
                  Save Token
                </Button>
                <Button variant="outline" onClick={refreshToken}>
                  Refresh Token
                </Button>
                <Button variant="secondary" onClick={() => void spotify.initialize()}>
                  <Radio className="h-4 w-4" />
                  Init SDK
                </Button>
                <Button onClick={() => void spotify.playTrack(room.round.spotifyUri, room.round.startMs)}>
                  <Play className="h-4 w-4" />
                  Play Round Clip
                </Button>
                <Button variant="outline" onClick={() => void spotify.pause()}>
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
              </div>

              <div className="text-sm font-semibold text-[#2d2a77]">
                <p>Connected: {spotify.connected ? "yes" : "no"}</p>
                <p>Ready: {spotify.ready ? "yes" : "no"}</p>
                <p>Device ID: {spotify.deviceId ?? "-"}</p>
                {!interactionUnlocked ? (
                  <p>Tap/click once on this page to unlock browser audio.</p>
                ) : null}
                {tokenStatus ? <p>{tokenStatus}</p> : null}
                {spotify.error ? <p className="text-[#b43d2b]">{spotify.error}</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Live Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl border-2 border-[#3049a3] bg-[#f3f0ff] px-3 py-2"
              >
                <span className="font-extrabold text-[#223f94]">
                  {index + 1}. {entry.name}
                </span>
                <Badge variant={index === 0 ? "success" : "default"}>{entry.points}</Badge>
              </div>
            ))}
            {leaderboard.length === 0 ? (
              <p className="text-center text-sm font-semibold text-[#51449e]">No players in room.</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link to={`/play/game/${roomId}`}>Open Player Game</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/results/${roomId}`}>Open Results</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={`/host/lobby/${roomId}`}>Back To Lobby</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
