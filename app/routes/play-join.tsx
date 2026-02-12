import { type FormEvent, useState } from "react";
import type { Route } from "./+types/play-join";
import { Link, useNavigate } from "react-router";

import { Ribbon } from "~/components/ribbon";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { createPlayerId, getPlayerSession, savePlayerSession } from "~/lib/player-session";
import { normalizeRoomCode } from "~/lib/room-code";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Join" }];
}

export default function PlayJoin() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("8372");
  const [playerName, setPlayerName] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeRoomCode(roomCode);
    const trimmedName = playerName.trim();
    if (!normalized) {
      return;
    }
    if (!trimmedName) {
      return;
    }

    const existingSession = getPlayerSession(normalized);

    savePlayerSession(normalized, {
      id: existingSession?.id ?? createPlayerId(),
      name: trimmedName,
    });

    navigate(`/play/lobby/${normalized}`);
  };

  return (
    <main className="jam-page">
      <section className="jam-stage w-full max-w-2xl">
        <Ribbon tone="cool">Join Room</Ribbon>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Player Device</CardTitle>
            <CardDescription>Use the room code shown on the host screen.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={submit}>
              <label className="grid gap-2 text-sm font-bold text-[#32277e]">
                Room code
                <Input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value)}
                  placeholder="8372"
                  maxLength={8}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-[#32277e]">
                Your name
                <Input
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="e.g. Alex"
                  maxLength={20}
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" size="lg" disabled={!playerName.trim()}>
                  Join Lobby
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/">Back</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

