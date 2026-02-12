import { useMemo } from "react";
import type { Route } from "./+types/play-game";
import { Link } from "react-router";

import { PlayerChip } from "~/components/player-chip";
import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import { phaseDurations, phaseLabel, useRoomState } from "~/lib/game-engine";
import { mockPlayers } from "~/lib/mock-room";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Player Game" }];
}

function phaseInstruction(phase: string) {
  switch (phase) {
    case "LISTEN":
      return "Listen carefully. Host controls playback on Spotify.";
    case "GUESS":
      return "Guess song and artist (autocomplete comes in Step 3).";
    case "TIMELINE":
      return "Place the song in your timeline (logic arrives in Step 4).";
    case "REVEAL":
      return "Review the correct answer and point awards.";
    default:
      return "Get ready for the next round.";
  }
}

export default function PlayGame({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const room = useRoomState(roomId, "player");

  const progress = useMemo(() => {
    if (room.state.lifecycle !== "running") {
      return 0;
    }

    const total = phaseDurations[room.state.phase];
    const elapsed = total - room.remainingMs;

    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  }, [room.remainingMs, room.state.lifecycle, room.state.phase]);

  return (
    <main className="jam-page">
      <section className="jam-stage w-full max-w-5xl">
        <Ribbon tone="cool">Player Round</Ribbon>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Badge>{room.state.lifecycle.toUpperCase()}</Badge>
          <Badge variant="warning">Round {room.state.roundIndex + 1}</Badge>
          <Badge variant={room.state.phase === "GUESS" ? "success" : "default"}>
            {phaseLabel(room.state.phase)}
          </Badge>
        </div>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>{phaseLabel(room.state.phase)} Phase</CardTitle>
            <CardDescription>{phaseInstruction(room.state.phase)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} />
            <p className="text-right text-sm font-bold text-[#2d2a77]">
              {room.state.lifecycle === "running" ? `${Math.ceil(room.remainingMs / 1000)}s` : "Waiting"}
            </p>

            <div className="rounded-2xl border-2 border-[#2f4eb8] bg-[#eef4ff] p-4 text-[#1f1f55]">
              <p className="font-[var(--font-display)] text-2xl text-[#243a84]">{room.round.title}</p>
              <p className="font-bold">{room.round.artist}</p>
              <p className="text-sm">Timeline answer: {room.round.year}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-[#32277e]">
                Song title
                <Input placeholder="Select from autocomplete (next step)" disabled />
              </label>
              <label className="grid gap-2 text-sm font-bold text-[#32277e]">
                Artist
                <Input placeholder="Select from autocomplete (next step)" disabled />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Players</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap justify-center gap-2">
              {mockPlayers.map((player) => (
                <PlayerChip key={player.id} player={player} />
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link to={`/play/lobby/${roomId}`}>Back To Lobby</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={`/results/${roomId}`}>Open Results</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
