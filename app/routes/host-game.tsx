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

const spotifyTokenKey = "chronojam:spotify-access-token";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Host Game" }];
}

export default function HostGame({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const room = useRoomState(roomId, "host");

  const [token, setToken] = useState("");
  const spotify = useSpotifyHostPlayer(token);
  const autoPlayedRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const saved = window.localStorage.getItem(spotifyTokenKey);
    if (saved) {
      setToken(saved);
    }
  }, []);

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
    if (room.state.lifecycle !== "running" || room.state.phase !== "LISTEN" || !spotify.connected) {
      return;
    }

    const autoplayKey = `${room.round.id}:${room.state.phaseStartedAt}`;
    if (autoPlayedRef.current === autoplayKey) {
      return;
    }

    autoPlayedRef.current = autoplayKey;
    void spotify.playTrack(room.round.spotifyUri, room.round.startMs);
  }, [
    room.round.id,
    room.round.spotifyUri,
    room.round.startMs,
    room.state.lifecycle,
    room.state.phase,
    room.state.phaseStartedAt,
    spotify,
  ]);

  const saveToken = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(spotifyTokenKey, token.trim());
  };

  const remainingSeconds = Math.ceil(room.remainingMs / 1000);

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
              <p className="font-[var(--font-display)] text-2xl text-[#243a84]">{room.round.title}</p>
              <p className="font-bold">{room.round.artist}</p>
              <p className="text-sm">Year: {room.round.year}</p>
              <p className="mt-2 text-xs font-semibold text-[#3e4f91]">{room.round.spotifyUri}</p>
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
                {spotify.error ? <p className="text-[#b43d2b]">{spotify.error}</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>

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
