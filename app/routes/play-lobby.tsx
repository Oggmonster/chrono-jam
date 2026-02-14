import { useEffect, useState } from "react";
import type { Route } from "./+types/play-lobby";
import { Link, useNavigate } from "react-router";
import { ArrowLeftRight, CheckCircle2, Loader2 } from "lucide-react";

import { CatMascot, Equalizer, GameCard, GameLayout, GameTitle } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
  const [dots, setDots] = useState("");
  usePlayerPresence(playerSession, room.controls);
  const preload = useLobbyPreload(roomId, room.state.lifecycle === "lobby", room.state.playlistIds);

  useEffect(() => {
    setPlayerSession(getPlayerSession(roomId));
  }, [roomId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 600);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

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
    <GameLayout className="mx-auto max-w-md">
      <div className="animate-slide-up flex flex-col items-center gap-6">
        <CatMascot variant="chill" size="md" className="animate-float" />

        <div className="flex flex-col items-center gap-3">
          <Badge variant="info">Player</Badge>
          <GameTitle className="text-2xl md:text-3xl">{running ? `Live: ${phaseLabel(room.state.phase)}` : `Waiting for host${dots}`}</GameTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Room <span className="font-mono text-lg font-bold text-[hsl(var(--primary))]">{roomId}</span>
            </span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground" />
            <span>{room.state.playlistIds.join(", ")}</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground" />
            <span>{room.state.gameSongCount} songs</span>
          </div>
        </div>

        <GameCard className="w-full p-5">
          <h3 className="mb-3 font-bold text-card-foreground">Players Connected</h3>
          <div className="stagger-children flex flex-wrap gap-2">
            {room.state.participants.map((player) => {
              const readiness = room.state.preloadReadiness[player.id];
              const ready = Boolean(readiness?.gamePackLoaded) && Boolean(readiness?.autocompleteLoaded);
              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-2 rounded-full border px-3 py-2 ${
                    ready ? "border-[hsl(155_65%_40%/0.25)] bg-[hsl(155_65%_40%/0.08)]" : "border-border bg-muted/40"
                  }`}
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: player.color }}
                  >
                    {player.name.charAt(0)}
                  </div>
                  <span className="text-sm font-semibold text-card-foreground">{player.name}</span>
                  {ready ? (
                    <CheckCircle2 className="h-4 w-4 text-[hsl(155_65%_40%)]" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              );
            })}
            {room.state.participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">Waiting for players to join.</p>
            ) : null}
          </div>
        </GameCard>

        <GameCard className="w-full p-5">
          <h3 className="mb-3 font-bold text-card-foreground">Your Status</h3>
          <div className="flex flex-col gap-2">
            <ReadyItem label="Game pack loaded" ready={preload.gamePackLoaded} />
            <ReadyItem label="Autocomplete ready" ready={preload.autocompleteLoaded} />
          </div>
          <div className="mt-4">
            <Badge variant={preload.ready ? "success" : "warning"}>{preload.ready ? "Ready" : "Preparing..."}</Badge>
          </div>
          {preload.error ? <p className="mt-2 text-xs text-[hsl(var(--destructive))]">{preload.error}</p> : null}
        </GameCard>

        <div className="flex flex-col items-center gap-2 py-1">
          <Equalizer />
          <p className="text-xs text-muted-foreground">The host will start the game soon</p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link to="/play/join">
              <ArrowLeftRight className="h-4 w-4" />
              Change Room
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Home</Link>
          </Button>
        </div>

        {!playerSession ? (
          <p className="text-center text-sm font-semibold text-[hsl(var(--destructive))]">
            {running
              ? "This game is already running on this device session. Rejoin using the same player profile."
              : "Join with a player name first to participate."}
          </p>
        ) : null}
      </div>
    </GameLayout>
  );
}

function ReadyItem({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-2">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          ready ? "bg-[hsl(155_65%_40%/0.15)] text-[hsl(155_65%_40%)]" : "bg-muted text-muted-foreground"
        }`}
      >
        {ready ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
      <span className="text-sm font-medium text-card-foreground">{label}</span>
    </div>
  );
}
