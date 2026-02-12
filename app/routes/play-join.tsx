import { type FormEvent, useState } from "react";
import type { Route } from "./+types/play-join";
import { Link, useNavigate } from "react-router";

import { Ribbon } from "~/components/ribbon";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { normalizeRoomCode } from "~/lib/room-code";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Join" }];
}

export default function PlayJoin() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("8372");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeRoomCode(roomCode);
    if (!normalized) {
      return;
    }

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

              <div className="flex flex-wrap gap-3">
                <Button type="submit" size="lg">
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

