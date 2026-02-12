import type { Route } from "./+types/home";
import { Link } from "react-router";
import { Music4 } from "lucide-react";

import { Ribbon } from "~/components/ribbon";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ChronoJam" },
    {
      name: "description",
      content: "Host and player portals for ChronoJam.",
    },
  ];
}

export default function Home() {
  return (
    <main className="jam-page">
      <section className="jam-stage w-full max-w-5xl">
        <Ribbon>Welcome to ChronoJam</Ribbon>

        <p className="mt-5 text-center text-xl font-bold text-[#2e2e79]">
          Hitster x Kahoot with host-controlled Spotify playback.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music4 className="h-6 w-6" /> Host Screen
              </CardTitle>
              <CardDescription>
                Premium Spotify playback, round controls, and phase orchestration.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button asChild variant="success" size="lg">
                <Link to="/host/setup">Open Host Setup</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/host/lobby/8372">Open Host Lobby Demo</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music4 className="h-6 w-6" /> Player Screen
              </CardTitle>
              <CardDescription>
                Join with room code and follow host-driven phases in real time.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button asChild variant="default" size="lg">
                <Link to="/play/join">Join A Room</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/play/lobby/8372">Open Player Lobby Demo</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
