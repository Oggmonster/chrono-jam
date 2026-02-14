import { type FormEvent, useState } from "react";
import type { Route } from "./+types/play-join";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, LogIn } from "lucide-react";

import { CatMascot, GameCard, GameLayout, GameSubtitle, GameTitle } from "~/components/game/game-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { createPlayerId, getPlayerSession, savePlayerSession } from "~/lib/player-session";
import { normalizeRoomCode } from "~/lib/room-code";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Join" }];
}

export default function PlayJoin() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeRoomCode(roomCode);
    const trimmedName = playerName.trim();
    if (!normalized) {
      return;
    }
    if (!trimmedName) {
      return;
    }

    setJoinError("");
    setJoining(true);
    const existingSession = getPlayerSession(normalized);
    const candidateId = existingSession?.id ?? createPlayerId();

    try {
      const response = await fetch(`/api/room/${encodeURIComponent(normalized)}`, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const room = (await response.json()) as {
          lifecycle?: string;
          allowedPlayerIds?: string[];
        };
        const running = room.lifecycle === "running";
        const allowedPlayerIds = Array.isArray(room.allowedPlayerIds) ? room.allowedPlayerIds : [];
        if (running && !allowedPlayerIds.includes(candidateId)) {
          setJoinError("Game already started. New players cannot join this round.");
          return;
        }
      }
    } catch {
      // Let join continue if the check endpoint is temporarily unavailable.
    } finally {
      setJoining(false);
    }

    savePlayerSession(normalized, {
      id: candidateId,
      name: trimmedName,
    });

    navigate(`/play/lobby/${normalized}`);
  };

  return (
    <GameLayout className="mx-auto max-w-md">
      <div className="animate-slide-up flex flex-col items-center gap-6">
        <CatMascot variant="thinking" size="md" className="animate-wiggle" />
        <div className="flex flex-col items-center gap-2">
          <GameTitle className="text-2xl md:text-3xl">Join a Room</GameTitle>
          <GameSubtitle>Enter the code shown on the host screen</GameSubtitle>
        </div>

        <GameCard className="w-full p-6">
          <form className="flex flex-col gap-5" onSubmit={submit}>
            <label className="flex flex-col gap-2 text-sm font-semibold text-card-foreground">
              Room Code
              <Input
                value={roomCode}
                onChange={(event) => {
                  setRoomCode(event.target.value.toUpperCase());
                  setJoinError("");
                }}
                placeholder="e.g. 6095"
                maxLength={8}
                className="h-14 text-center font-mono text-2xl font-bold tracking-[0.3em]"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-card-foreground">
              Your Name
              <Input
                value={playerName}
                onChange={(event) => {
                  setPlayerName(event.target.value);
                  setJoinError("");
                }}
                placeholder="e.g. Alex"
                maxLength={20}
                className="h-12"
              />
            </label>

            {joinError ? <p className="text-sm font-semibold text-[hsl(var(--destructive))]">{joinError}</p> : null}

            <div className="flex gap-3 pt-2">
              <Button type="submit" size="lg" className="h-12 flex-1" disabled={!playerName.trim() || joining}>
                <LogIn className="h-4 w-4" />
                Join Lobby
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12">
                <Link to="/">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </form>
        </GameCard>
      </div>
    </GameLayout>
  );
}

