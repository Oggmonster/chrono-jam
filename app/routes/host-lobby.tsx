import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/host-lobby";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CheckCheck, Copy, Play, RotateCcw, Shield, Users, Wifi } from "lucide-react";

import { CatMascot, GameCard, GameLayout, GameSubtitle, GameTitle } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { parseGameSongCount } from "~/lib/game-settings";
import { useRoomState } from "~/lib/game-engine";
import {
  readStoredSpotifyToken,
  refreshSpotifyAccessToken,
  resolveSpotifyAccessToken,
} from "~/lib/spotify-token";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Host Lobby" }];
}

export default function HostLobby({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const room = useRoomState(roomId, "host");
  const [spotifyTokenPresent, setSpotifyTokenPresent] = useState(false);
  const [spotifyTokenStatus, setSpotifyTokenStatus] = useState("");
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const attemptedSongCountSyncRef = useRef<number | null>(null);
  const readinessRows = useMemo(
    () =>
      room.state.participants.map((player) => {
        const readiness = room.state.preloadReadiness[player.id];
        const ready =
          Boolean(readiness?.gamePackLoaded) &&
          Boolean(readiness?.autocompleteLoaded);

        return {
          player,
          readiness,
          ready,
        };
      }),
    [room.state.participants, room.state.preloadReadiness],
  );
  const selectedPlaylistIdsFromQuery = useMemo(() => {
    const param = searchParams.get("playlists") ?? "";
    return [
      ...new Set(
        param
          .split(",")
          .map((playlistId) => playlistId.trim())
          .filter((playlistId) => playlistId.length > 0),
      ),
    ];
  }, [searchParams]);
  const requestedSongCountFromQuery = useMemo(
    () => parseGameSongCount(searchParams.get("songs")),
    [searchParams],
  );
  const playlistSelectionPending =
    room.state.lifecycle === "lobby" &&
    selectedPlaylistIdsFromQuery.length > 0 &&
    selectedPlaylistIdsFromQuery.join(",") !== room.state.playlistIds.join(",");
  const songCountSelectionPending =
    room.state.lifecycle === "lobby" &&
    requestedSongCountFromQuery !== null &&
    requestedSongCountFromQuery !== room.state.gameSongCount;
  const readyCount = readinessRows.filter((entry) => entry.ready).length;
  const allReady = readinessRows.length > 0 && readyCount === readinessRows.length;
  const canStartNormally =
    !playlistSelectionPending &&
    !songCountSelectionPending &&
    (room.state.participants.length === 0 || allReady);

  const checkTokenStatus = async () => {
    const stored = readStoredSpotifyToken();
    setSpotifyTokenPresent(Boolean(stored.accessToken));

    try {
      const resolved = await resolveSpotifyAccessToken();
      setSpotifyTokenPresent(true);
      if (resolved.source === "refresh") {
        setSpotifyTokenStatus("Spotify token refreshed.");
      } else if (!stored.accessToken) {
        setSpotifyTokenStatus("Spotify token ready.");
      }
    } catch {
      const fallback = readStoredSpotifyToken();
      setSpotifyTokenPresent(Boolean(fallback.accessToken));
      if (!fallback.accessToken) {
        setSpotifyTokenStatus("Spotify token missing. Reconnect Spotify.");
      }
    }
  };

  const refreshTokenNow = () => {
    setRefreshingToken(true);
    void refreshSpotifyAccessToken()
      .then(() => {
        setSpotifyTokenPresent(true);
        setSpotifyTokenStatus("Spotify token refreshed.");
      })
      .catch(() => {
        setSpotifyTokenStatus("Spotify token refresh failed. Reconnect Spotify.");
      })
      .finally(() => {
        setRefreshingToken(false);
      });
  };

  useEffect(() => {
    if (room.state.lifecycle !== "running") {
      return;
    }

    navigate(`/host/game/${roomId}`, { replace: true });
  }, [navigate, room.state.lifecycle, roomId]);

  useEffect(() => {
    if (room.state.lifecycle !== "lobby") {
      return;
    }

    if (selectedPlaylistIdsFromQuery.length === 0) {
      return;
    }

    if (selectedPlaylistIdsFromQuery.join(",") === room.state.playlistIds.join(",")) {
      return;
    }

    room.controls.updatePlaylistIds(selectedPlaylistIdsFromQuery);
  }, [room.controls, room.state.lifecycle, room.state.playlistIds, selectedPlaylistIdsFromQuery]);

  useEffect(() => {
    attemptedSongCountSyncRef.current = null;
  }, [requestedSongCountFromQuery]);

  useEffect(() => {
    if (room.state.lifecycle !== "lobby") {
      return;
    }

    if (playlistSelectionPending) {
      return;
    }

    if (requestedSongCountFromQuery === null) {
      return;
    }

    if (requestedSongCountFromQuery === room.state.gameSongCount) {
      return;
    }

    if (attemptedSongCountSyncRef.current === requestedSongCountFromQuery) {
      return;
    }

    attemptedSongCountSyncRef.current = requestedSongCountFromQuery;
    room.controls.updateGameSongCount(requestedSongCountFromQuery);
  }, [
    playlistSelectionPending,
    requestedSongCountFromQuery,
    room.controls,
    room.state.gameSongCount,
    room.state.lifecycle,
  ]);

  useEffect(() => {
    void checkTokenStatus();
    const timer = window.setInterval(() => {
      void checkTokenStatus();
    }, 15_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <GameLayout className="mx-auto max-w-2xl">
      <div className="animate-slide-up flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="warning">Host</Badge>
          <GameTitle className="text-2xl md:text-3xl">Game Lobby</GameTitle>
          <GameSubtitle>
            {room.state.playlistIds.join(", ")} • {room.state.gameSongCount} songs
          </GameSubtitle>
        </div>

        <GameCard className="w-full max-w-sm p-6 text-center" glow>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Room Code</p>
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono text-5xl font-bold tracking-[0.25em] text-[hsl(var(--primary))]">{roomId}</span>
            <button
              type="button"
              onClick={copyCode}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-card-foreground"
              aria-label="Copy room code"
            >
              {copied ? <CheckCheck className="h-5 w-5 text-[hsl(155_65%_40%)]" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Share this with your players</p>
        </GameCard>

        <div className="grid w-full gap-4 md:grid-cols-2">
          <GameCard className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[hsl(var(--accent))]" />
                <h3 className="font-bold text-card-foreground">Players</h3>
              </div>
              <Badge variant={allReady ? "success" : "default"}>
                {readyCount}/{readinessRows.length} ready
              </Badge>
            </div>
            <div className="stagger-children flex flex-col gap-2">
              {readinessRows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <CatMascot variant="thinking" size="sm" />
                  <p className="text-center text-sm text-muted-foreground">Waiting for players to join...</p>
                </div>
              ) : (
                readinessRows.map((entry) => (
                  <div
                    key={entry.player.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      entry.ready ? "border-[hsl(155_65%_40%/0.25)] bg-[hsl(155_65%_40%/0.08)]" : "border-border bg-muted/40"
                    }`}
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: entry.player.color }}
                    >
                      {entry.player.name.charAt(0)}
                    </div>
                    <span className="flex-1 text-sm font-semibold text-card-foreground">{entry.player.name}</span>
                    <Badge variant={entry.ready ? "success" : "default"} className="text-[10px]">
                      {entry.ready ? "Ready" : "Loading..."}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </GameCard>

          <GameCard className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[hsl(var(--accent))]" />
              <h3 className="font-bold text-card-foreground">System Status</h3>
            </div>
            <div className="flex flex-col gap-3">
              <StatusItem
                label="Spotify Token"
                detail={spotifyTokenPresent ? "Host token active" : "Reconnect required"}
                status={spotifyTokenPresent ? "ready" : "waiting"}
              />
              <StatusItem
                label="Game Pack"
                detail={`${room.state.gameSongCount} songs loaded`}
                status={room.state.gameSongCount > 0 ? "ready" : "waiting"}
              />
              <StatusItem
                label="Player Sync"
                detail={allReady ? "All synced" : "Waiting for players"}
                status={allReady ? "ready" : "waiting"}
              />
              {spotifyTokenStatus ? <p className="text-xs text-muted-foreground">{spotifyTokenStatus}</p> : null}
              <Button variant="outline" onClick={refreshTokenNow} disabled={refreshingToken}>
                {refreshingToken ? "Refreshing..." : "Refresh Token"}
              </Button>
            </div>
          </GameCard>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="success" size="lg" onClick={room.controls.startGame} disabled={!canStartNormally}>
            <Play className="h-4 w-4" />
            Start Game
          </Button>
          {!canStartNormally ? (
            <Button variant="outline" onClick={room.controls.startGame}>
              Force Start
            </Button>
          ) : null}
          <Button variant="outline" onClick={room.controls.resetLobby}>
            Reset Room
          </Button>
        </div>
        {!canStartNormally ? (
          <p className="mt-2 text-center text-xs font-semibold text-[#8d2e2a]">
            {playlistSelectionPending
              ? "Applying selected playlist pack to this room..."
              : songCountSelectionPending
                ? "Applying selected song-count limit to this room..."
              : "Waiting for preload completion. Use Force Start to override."}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link to={`/play/lobby/${roomId}`}>Open Player Lobby</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/host/setup">Back To Setup</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Home</Link>
          </Button>
        </div>
      </div>
    </GameLayout>
  );
}

function StatusItem({
  label,
  detail,
  status,
}: {
  label: string;
  detail: string;
  status: "ready" | "waiting" | "error";
}) {
  const dotClass =
    status === "ready"
      ? "bg-[hsl(155_65%_40%)]"
      : status === "error"
        ? "bg-[hsl(var(--destructive))]"
        : "bg-[hsl(45_95%_52%)]";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="relative">
        <Wifi className="h-4 w-4 text-muted-foreground" />
        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${dotClass}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-card-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
