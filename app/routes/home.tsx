import type { Route } from "./+types/home";
import { Link } from "react-router";

import { CatMascot, GameCard, GameLayout, GameSubtitle, GameTitle } from "~/components/game/game-layout";

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
    <GameLayout className="max-w-lg">
      <div className="animate-slide-up flex flex-col items-center gap-8 pt-6 md:pt-10">
        <div className="flex flex-col items-center gap-5">
          <div className="home-brand-lockup relative inline-flex items-start justify-center px-2">
            <GameTitle className="home-brand-title relative z-10">
              <span className="home-brand-chrono">Chrono</span>
              <span className="home-brand-jam">Jam</span>
            </GameTitle>
          </div>
          <GameSubtitle>Guess the song, name the artist, place the year. Play with friends!</GameSubtitle>
        </div>

        <div className="flex w-full flex-col gap-4">
          <GameCard className="p-6">
            <div className="flex items-start gap-4">
              <CatMascot
                variant="chill"
                size="sm"
                className="h-16 w-16 shrink-0 rounded-xl border border-border shadow-md shadow-[hsl(var(--foreground)/0.08)]"
              />
              <div className="flex-1">
                <h2 className="text-lg font-bold text-card-foreground">Host a Game</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Set up a room, pick a playlist, and control the game. Requires Spotify Premium.
                </p>
                <Link
                  to="/host/lobby"
                  className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-[hsl(var(--primary))] px-8 text-sm font-bold text-white shadow-md shadow-[hsl(var(--primary)/0.2)] transition-colors hover:bg-[hsl(var(--primary)/0.9)]"
                >
                  Open Host Lobby
                </Link>
              </div>
            </div>
          </GameCard>

          <GameCard className="p-6">
            <div className="flex items-start gap-4">
              <CatMascot
                variant="default"
                size="sm"
                className="h-16 w-16 shrink-0 rounded-xl border border-border shadow-md shadow-[hsl(var(--foreground)/0.08)]"
              />
              <div className="flex-1">
                <h2 className="text-lg font-bold text-card-foreground">Join a Room</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Enter the room code from your host and start guessing songs in real time.
                </p>
                <Link
                  to="/play/join"
                  className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-[hsl(var(--accent))] px-8 text-sm font-bold text-white shadow-md shadow-[hsl(var(--accent)/0.2)] transition-colors hover:bg-[hsl(var(--accent)/0.9)]"
                >
                  Join as Player
                </Link>
              </div>
            </div>
          </GameCard>
        </div>

        <p className="text-center text-xs text-muted-foreground">Best played on a big screen with friends around</p>
      </div>
    </GameLayout>
  );
}
