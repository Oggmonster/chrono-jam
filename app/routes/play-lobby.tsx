import type { Route } from "./+types/play-lobby";
import { Link } from "react-router";

import { PlayerChip } from "~/components/player-chip";
import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { phaseLabel, useRoomState } from "~/lib/game-engine";
import { mockPlayers } from "~/lib/mock-room";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Player Lobby" }];
}

export default function PlayLobby({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const room = useRoomState(roomId, "player");
  const running = room.state.lifecycle === "running";

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

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Players Connected</CardTitle>
            <CardDescription>Host and players are now split into separate route flows.</CardDescription>
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
          <Button asChild size="lg" disabled={!running}>
            <Link to={`/play/game/${roomId}`}>Enter Round Screen</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/play/join">Change Room</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
