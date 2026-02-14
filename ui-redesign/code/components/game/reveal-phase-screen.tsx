"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, XCircle, TrendingUp, Music } from "lucide-react"
import { GameLayout, GameCard, GameBadge, TimerBar } from "./game-layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function RevealPhaseScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [showResults, setShowResults] = useState(false)
  const [timeLeft, setTimeLeft] = useState(15)

  useEffect(() => {
    const timer = setTimeout(() => setShowResults(true), 300)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      onNavigate("intermission")
    }
  }, [timeLeft, onNavigate])

  const progress = (timeLeft / 15) * 100

  const results = [
    { label: "Song title", correct: true, points: 507, answer: "The Greatest" },
    { label: "Artist", correct: true, points: 304, answer: "Cat Power" },
    { label: "Timeline", correct: false, points: 0, answer: "2006" },
  ]

  const roundPoints = results.reduce((acc, r) => acc + r.points, 0)
  const totalPoints = 1011

  return (
    <GameLayout className="max-w-lg mx-auto">
      <div className="flex flex-col gap-5 animate-slide-up">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GameBadge variant="listening">Round 2</GameBadge>
            <GameBadge variant="default">Score {totalPoints}</GameBadge>
          </div>
          <GameBadge variant="success">Reveal</GameBadge>
        </div>

        {/* Correct Answer Card */}
        <GameCard className="p-6 border-accent/30 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-accent" />
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <Music className="w-7 h-7 text-accent" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-card-foreground">The Greatest</h2>
              <p className="text-base font-semibold text-muted-foreground">Cat Power</p>
              <p className="text-sm text-muted-foreground mt-1">Released in 2006</p>
            </div>
          </div>
        </GameCard>

        <TimerBar progress={progress} seconds={timeLeft} variant="default" />

        {/* Round Results */}
        {showResults && (
          <GameCard className="p-5 animate-slide-up">
            <h3 className="font-bold text-card-foreground mb-4">Round Result</h3>
            <div className="flex flex-col gap-2 stagger-children">
              {results.map((result) => (
                <div
                  key={result.label}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    result.correct
                      ? "bg-[hsl(155_65%_40%)]/8 border-[hsl(155_65%_40%)]/25"
                      : "bg-destructive/8 border-destructive/25"
                  )}
                >
                  {result.correct ? (
                    <CheckCircle2 className="w-5 h-5 text-[hsl(155_65%_40%)] shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-destructive shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-card-foreground flex-1">
                    {result.label}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold font-mono",
                      result.correct ? "text-[hsl(155_65%_40%)]" : "text-destructive"
                    )}
                  >
                    {result.correct ? `+${result.points}` : "0"}
                  </span>
                </div>
              ))}
            </div>
          </GameCard>
        )}

        {/* Scoring Summary */}
        {showResults && (
          <GameCard className="p-5 animate-slide-up" style={{ animationDelay: "200ms" }}>
            <h3 className="font-bold text-card-foreground mb-3">Your Scoring</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[hsl(155_65%_40%)]/8 border border-[hsl(155_65%_40%)]/25">
                <TrendingUp className="w-4 h-4 text-[hsl(155_65%_40%)]" />
                <span className="text-sm font-bold text-[hsl(155_65%_40%)]">+{roundPoints}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/8 border border-primary/25">
                <span className="text-sm font-bold text-primary">Total: {totalPoints}</span>
              </div>
            </div>
          </GameCard>
        )}

        {/* Bottom Actions */}
        <div className="flex justify-center gap-3">
          <Button
            onClick={() => onNavigate("player-lobby")}
            variant="outline"
            size="sm"
            className="border-border text-card-foreground hover:bg-muted/50"
          >
            Back To Lobby
          </Button>
          <Button
            onClick={() => onNavigate("final")}
            size="sm"
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            Open Results
          </Button>
        </div>
      </div>
    </GameLayout>
  )
}
