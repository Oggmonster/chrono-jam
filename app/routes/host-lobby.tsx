import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/host-lobby";
import { Link, useNavigate, useSearchParams } from "react-router";

import { PlayerChip } from "~/components/player-chip";
import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
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

  return (
    <main className="jam-page">
      <section className="jam-stage w-full max-w-5xl">
        <Ribbon>Host Lobby</Ribbon>

        <p className="mt-4 text-center text-2xl font-bold text-[#2e2e79]">
          Room Code: <span className="text-[#d84837]">{roomId}</span>
        </p>
        <p className="mt-2 text-center text-xs font-semibold text-[#4f5fa2]">
          Playlists: {room.state.playlistIds.join(", ")}
        </p>
        <p className="mt-1 text-center text-xs font-semibold text-[#4f5fa2]">
          Songs in game: {room.state.gameSongCount}
        </p>

        <div className="mt-4 flex justify-center">
          <Badge>{room.state.lifecycle.toUpperCase()}</Badge>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Players</CardTitle>
              <CardDescription>Split player screens can now join independently.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap justify-center gap-2" aria-label="Players in room">
                {room.state.participants.map((player) => (
                  <PlayerChip key={player.id} player={player} />
                ))}
              </ul>
              {room.state.participants.length === 0 ? (
                <p className="text-center text-sm font-semibold text-[#51449e]">No players joined yet.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preload Checks</CardTitle>
              <CardDescription>Live readiness from connected player lobbies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm font-semibold text-[#1f1f55]">
                Ready players: {readyCount}/{readinessRows.length}
              </p>
              {readinessRows.map((entry) => (
                <div
                  key={entry.player.id}
                  className="rounded-xl border-2 border-[#2f4eb8] bg-[#eef4ff] px-3 py-2 text-xs font-semibold text-[#1f1f55]"
                >
                  <p className="mb-1 font-bold text-[#223f94]">{entry.player.name}</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={entry.readiness?.gamePackLoaded ? "success" : "warning"}>Pack</Badge>
                    <Badge variant={entry.readiness?.autocompleteLoaded ? "success" : "warning"}>Autocomplete</Badge>
                    <Badge variant={entry.ready ? "success" : "warning"}>
                      {entry.ready ? "Ready" : "Loading"}
                    </Badge>
                  </div>
                  {entry.readiness?.gamePackHash ? (
                    <p className="mt-1 text-[11px] font-semibold text-[#5f6da6]">
                      hash {entry.readiness.gamePackHash.slice(0, 8)}
                    </p>
                  ) : null}
                </div>
              ))}
              {readinessRows.length === 0 ? (
                <p className="text-center text-sm font-semibold text-[#51449e]">Waiting for players to join.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spotify Token</CardTitle>
              <CardDescription>Refresh here before starting to keep autoplay reliable.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#1f1f55]">
                <Badge variant={spotifyTokenPresent ? "success" : "warning"}>
                  {spotifyTokenPresent ? "OK" : "Missing"}
                </Badge>
                Host token
              </p>
              {spotifyTokenStatus ? <p className="text-xs font-semibold text-[#4f5fa2]">{spotifyTokenStatus}</p> : null}
              <Button variant="outline" onClick={refreshTokenNow} disabled={refreshingToken}>
                {refreshingToken ? "Refreshing..." : "Refresh Token"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="success" size="lg" onClick={room.controls.startGame} disabled={!canStartNormally}>
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

        {room.state.lifecycle === "running" ? (
          <p className="mt-3 text-center text-sm font-semibold text-[#2e2e79]">
            Game is live. This screen auto-redirects to host game.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link to={`/play/lobby/${roomId}`}>Open Player Lobby</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/host/setup">Back To Setup</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
