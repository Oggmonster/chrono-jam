import { useEffect, useState } from "react";
import type { Route } from "./+types/play-lobby";
import { Link, useNavigate } from "react-router";

import { PlayerChip } from "~/components/player-chip";
import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { phaseLabel, useRoomState } from "~/lib/game-engine";
import { useLobbyPreload } from "~/lib/lobby-preload";
import { usePlayerPresence } from "~/lib/player-presence";
import { getPlayerSession, type PlayerSession } from "~/lib/player-session";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Player Lobby" }];
}

export default function PlayLobby({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const navigate = useNavigate();
  const room = useRoomState(roomId, "player");
  const running = room.state.lifecycle === "running";
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(null);
  usePlayerPresence(playerSession, room.controls);
  const preload = useLobbyPreload(roomId, room.state.lifecycle === "lobby", room.state.playlistIds);

  useEffect(() => {
    setPlayerSession(getPlayerSession(roomId));
  }, [roomId]);

  useEffect(() => {
    if (!running || !playerSession) {
      return;
    }

    navigate(`/play/game/${roomId}`, { replace: true });
  }, [navigate, playerSession, roomId, running]);

  useEffect(() => {
    if (!playerSession || room.state.lifecycle !== "lobby") {
      return;
    }

    const publishReadiness = () => {
      room.controls.updatePreload({
        playerId: playerSession.id,
        gamePackLoaded: preload.gamePackLoaded,
        autocompleteLoaded: preload.autocompleteLoaded,
        gamePackHash: preload.gamePackHash,
      });
    };

    publishReadiness();
    const interval = window.setInterval(publishReadiness, 3_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [
    playerSession,
    preload.autocompleteLoaded,
    preload.gamePackHash,
    preload.gamePackLoaded,
    room.controls,
    room.state.lifecycle,
  ]);

  return (
    <main className="jam-page">
      <section className="jam-stage w-full max-w-3xl">
        <Ribbon tone="cool">Player Lobby</Ribbon>

        <p className="mt-4 text-center text-xl font-bold text-[#2e2e79]">
          Room Code: <span className="text-[#d84837]">{roomId}</span>
        </p>

        <div className="mt-4 flex justify-center">
          <Badge variant={running ? "success" : "default"}>
            {running ? `LIVE: ${phaseLabel(room.state.phase)}` : "Waiting for host"}
          </Badge>
        </div>
        <p className="mt-2 text-center text-xs font-semibold text-[#4f5fa2]">
          Playlists: {room.state.playlistIds.join(", ")}
        </p>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Players Connected</CardTitle>
            <CardDescription>Host and players are now split into separate route flows.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap justify-center gap-2">
              {room.state.participants.map((player) => (
                <PlayerChip key={player.id} player={player} />
              ))}
            </ul>
            {room.state.participants.length === 0 ? (
              <p className="text-center text-sm font-semibold text-[#51449e]">No players joined yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Your Preload Status</CardTitle>
            <CardDescription>Ready state is synced to the host lobby in real time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#1f1f55]">
              <Badge variant={preload.gamePackLoaded ? "success" : "warning"}>
                {preload.gamePackLoaded ? "OK" : "..."}
              </Badge>
              Game pack loaded
            </p>
            <p className="flex items-center gap-2 text-sm font-semibold text-[#1f1f55]">
              <Badge variant={preload.autocompleteLoaded ? "success" : "warning"}>
                {preload.autocompleteLoaded ? "OK" : "..."}
              </Badge>
              Autocomplete ready
            </p>
            <p className="text-xs font-semibold text-[#4f5fa2]">
              Source: {preload.gamePackSource === "none" ? "-" : preload.gamePackSource}
              {preload.gamePackHash ? ` | hash ${preload.gamePackHash.slice(0, 8)}` : ""}
            </p>
            {preload.error ? <p className="text-xs font-semibold text-[#8d2e2a]">{preload.error}</p> : null}
            {!preload.error && !preload.ready ? (
              <p className="text-xs font-semibold text-[#6b3f9b]">Preparing lobby assets...</p>
            ) : null}
            {preload.ready ? <Badge variant="success">Ready</Badge> : null}
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="secondary">
            <Link to="/play/join">Change Room</Link>
          </Button>
        </div>
        {running && playerSession ? (
          <p className="mt-3 text-center text-sm font-semibold text-[#2e2e79]">
            Game is live. You are auto-redirected to your round screen.
          </p>
        ) : null}
        {!playerSession ? (
          <p className="mt-3 text-center text-sm font-semibold text-[#8d2e2a]">
            {running
              ? "This game is already running on this device session. Rejoin using the same player profile."
              : "Join with a player name first to participate."}
          </p>
        ) : null}
      </section>
    </main>
  );
}
