import type { Route } from "./+types/results";
import { Link } from "react-router";

import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useRoomState } from "~/lib/game-engine";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Results" }];
}

export default function Results({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const room = useRoomState(roomId, "player");
  const ranking = room.state.participants.map((participant, index) => ({
    id: participant.id,
    name: participant.name,
    points: Math.max(200, 1000 - index * 200),
  }));

  return (
    <main className="jam-page">
      <section className="jam-stage w-full max-w-4xl">
        <Ribbon>Round Results</Ribbon>

        <p className="mt-4 text-center text-xl font-bold text-[#2e2e79]">
          {room.round.title} by {room.round.artist} ({room.round.year})
        </p>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Leaderboard (Temporary Points)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ranking.map((entry, index) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl border-2 border-[#3049a3] bg-[#f3f0ff] px-3 py-2"
              >
                <span className="font-extrabold text-[#223f94]">
                  {index + 1}. {entry.name}
                </span>
                <Badge variant={index === 0 ? "success" : "default"}>+{entry.points}</Badge>
              </div>
            ))}
            {ranking.length === 0 ? (
              <p className="text-center text-sm font-semibold text-[#51449e]">No players to rank yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="success">
            <Link to={`/host/game/${roomId}`}>Next Round (Host)</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={`/play/game/${roomId}`}>Back To Player Game</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
