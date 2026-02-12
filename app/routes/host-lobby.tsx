import type { Route } from "./+types/host-lobby";
import { Link } from "react-router";

import { PlayerChip } from "~/components/player-chip";
import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { useRoomState } from "~/lib/game-engine";
import { preloadChecks } from "~/lib/mock-room";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Host Lobby" }];
}

export default function HostLobby({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const room = useRoomState(roomId, "host");

  return (
    <main className="jam-page">
      <section className="jam-stage w-full max-w-5xl">
        <Ribbon>Host Lobby</Ribbon>

        <p className="mt-4 text-center text-2xl font-bold text-[#2e2e79]">
          Room Code: <span className="text-[#d84837]">{roomId}</span>
        </p>

        <div className="mt-4 flex justify-center">
          <Badge>{room.state.lifecycle.toUpperCase()}</Badge>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
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
              <CardDescription>Static for now, will become live readiness in Step 6.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {preloadChecks.map((item) => (
                <p key={item} className="flex items-center gap-2 text-sm font-bold text-[#1f1f55]">
                  <Badge variant="success">OK</Badge>
                  {item}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="success" size="lg" onClick={room.controls.startGame}>
            Start Game
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link to={`/host/game/${roomId}`}>Open Host Game</Link>
          </Button>
          <Button variant="outline" onClick={room.controls.resetLobby}>
            Reset Room
          </Button>
        </div>

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
