import type { Route } from "./+types/results";
import { Link } from "react-router";
import { ArrowLeft, Crown, Home, Music, Star, Trophy } from "lucide-react";

import { CatMascot, GameCard, GameLayout } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useRoomState } from "~/lib/game-engine";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Results" }];
}

export default function Results({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const room = useRoomState(roomId, "player");
  const ranking = [...room.state.participants]
    .map((participant) => ({
      id: participant.id,
      color: participant.color,
      name: participant.name,
      points: room.state.scores[participant.id] ?? 0,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const winner = ranking[0];
  const songsPlayed = room.state.rounds;

  return (
    <GameLayout className="mx-auto max-w-lg">
      <div className="animate-slide-up flex flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <Badge variant="warning">Finished</Badge>
          <Badge variant="default">{winner ? `Final Score ${winner.points}` : "Final Score 0"}</Badge>
        </div>

        <GameCard className="relative overflow-hidden border-[hsl(var(--primary)/0.25)] p-8 text-center">
          <div className="relative z-10 flex flex-col items-center gap-4">
            <CatMascot variant="celebrate" size="lg" className="animate-bounce-in" />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)]">
              <Trophy className="h-8 w-8 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Game Complete</p>
              <h2 className="text-3xl font-bold text-card-foreground">Final Standings</h2>
            </div>
          </div>
        </GameCard>

        <GameCard className="p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-card-foreground">
            <Trophy className="h-4 w-4 text-[hsl(var(--primary))]" />
            Final Standings
          </h3>
          <div className="space-y-2">
            {ranking.map((entry, index) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 rounded-xl border p-4 ${
                  index === 0
                    ? "border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] shadow-md shadow-[hsl(var(--primary)/0.1)]"
                    : "border-border bg-muted/40"
                }`}
              >
                <div className="flex w-8 items-center justify-center">
                  {index === 0 ? (
                    <Crown className="h-6 w-6 text-[hsl(var(--primary))]" />
                  ) : index === 1 ? (
                    <Star className="h-5 w-5 text-[hsl(45_95%_52%)]" />
                  ) : (
                    <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                  )}
                </div>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: entry.color }}
                >
                  {entry.name.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 font-bold text-card-foreground">{entry.name}</span>
                <span className="font-mono text-xl font-bold text-[hsl(var(--primary))]">{entry.points}</span>
              </div>
            ))}
            {ranking.length === 0 ? <p className="text-sm text-muted-foreground">No players to rank yet.</p> : null}
          </div>
        </GameCard>

        <GameCard className="p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-card-foreground">
            <Music className="h-4 w-4 text-[hsl(var(--accent))]" />
            Songs Played
          </h3>
          {songsPlayed.length > 0 ? (
            <ol className="space-y-2">
              {songsPlayed.map((round, index) => (
                <li key={round.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/35 p-3">
                  {round.coverUrl ? (
                    <img
                      src={round.coverUrl}
                      alt={`${round.title} cover art`}
                      className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60">
                      <Music className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-card-foreground">{round.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{round.artist}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold text-card-foreground">{round.year}</p>
                    <p className="text-[10px] text-muted-foreground">#{index + 1}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No rounds recorded for this game.</p>
          )}
        </GameCard>

        <div className="flex justify-center gap-3">
          <Button asChild variant="outline">
            <Link to={`/play/lobby/${roomId}`}>
              <ArrowLeft className="h-4 w-4" />
              Back To Lobby
            </Link>
          </Button>
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4" />
              Home
            </Link>
          </Button>
        </div>
      </div>
    </GameLayout>
  );
}
