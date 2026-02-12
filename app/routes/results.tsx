import type { Route } from "./+types/results";
import { Link } from "react-router";

import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useRoomState } from "~/lib/game-engine";
import { leaderboard, mockPlayers } from "~/lib/mock-room";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Results" }];
}

export default function Results({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const room = useRoomState(roomId, "player");

  return (
    <main className="jam-page">
      <section className="jam-stage w-full max-w-4xl">
        <Ribbon>Round Results</Ribbon>

        <p className="mt-4 text-center text-xl font-bold text-[#2e2e79]">
          {room.round.title} by {room.round.artist} ({room.round.year})
        </p>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Leaderboard (Mock Points)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leaderboard.map((entry, index) => {
              const player = mockPlayers.find(({ id }) => id === entry.playerId);
              if (!player) {
                return null;
              }

              return (
                <div
                  key={entry.playerId}
                  className="flex items-center justify-between rounded-xl border-2 border-[#3049a3] bg-[#f3f0ff] px-3 py-2"
                >
                  <span className="font-extrabold text-[#223f94]">
                    {index + 1}. {player.name}
                  </span>
                  <Badge variant={index === 0 ? "success" : "default"}>+{entry.points}</Badge>
                </div>
              );
            })}
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
