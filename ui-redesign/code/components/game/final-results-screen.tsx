"use client"

import { useState, useEffect } from "react"
import { Trophy, Star, Crown, ArrowLeft, Medal } from "lucide-react"
import { GameLayout, GameCard, GameBadge, CatMascot } from "./game-layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FINAL_STANDINGS = [
  { name: "tee", score: 888, rank: 1 },
  { name: "aaa", score: 335, rank: 2 },
  { name: "Jordan", score: 200, rank: 3 },
]

export function FinalResultsScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [revealedCount, setRevealedCount] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    const standings = [...FINAL_STANDINGS].reverse()
    standings.forEach((_, i) => {
      setTimeout(() => setRevealedCount((prev) => prev + 1), (i + 1) * 800)
    })
    setTimeout(() => setShowConfetti(true), FINAL_STANDINGS.length * 800 + 400)
  }, [])

  const winner = FINAL_STANDINGS[0]
  const revealedStandings = [...FINAL_STANDINGS]
    .reverse()
    .slice(0, revealedCount)
    .reverse()

  return (
    <GameLayout className="max-w-lg mx-auto">
      <div className="flex flex-col gap-6 animate-slide-up">
        {/* Top Bar */}
        <div className="flex items-center justify-center gap-2">
          <GameBadge variant="warning">Finished</GameBadge>
          <GameBadge variant="default">Final Score {winner.score}</GameBadge>
        </div>

        {/* Winner Announcement with cat */}
        <GameCard
          className={cn(
            "p-8 text-center relative overflow-hidden border-primary/25",
            showConfetti && "animate-pulse-glow"
          )}
        >
          {/* Confetti dots */}
          {showConfetti && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {Array.from({ length: 16 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full animate-float"
                  style={{
                    left: `${8 + (i * 5.5) % 84}%`,
                    top: `${4 + (i * 9) % 70}%`,
                    backgroundColor: [
                      "hsl(4 80% 62%)",
                      "hsl(174 60% 42%)",
                      "hsl(45 95% 52%)",
                      "hsl(200 75% 50%)",
                      "hsl(262 50% 58%)",
                    ][i % 5],
                    animationDelay: `${i * 0.15}s`,
                    opacity: 0.5,
                  }}
                />
              ))}
            </div>
          )}

          <div className="relative z-10 flex flex-col items-center gap-4">
            <CatMascot variant="celebrate" size="lg" className={showConfetti ? "animate-bounce-in" : ""} />
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold mb-1">
                Game Complete
              </p>
              <h2 className="text-3xl font-bold text-card-foreground text-balance">
                Final Standings
              </h2>
            </div>
          </div>
        </GameCard>

        {/* Last Round Result */}
        <GameCard className="p-5">
          <h3 className="font-bold text-card-foreground mb-3">Last Round</h3>
          <div className="flex flex-col gap-2">
            {[
              { label: "Song title", correct: false },
              { label: "Artist", correct: false },
              { label: "Timeline", correct: false },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-destructive/8 border border-destructive/20"
              >
                <div className="w-5 h-5 rounded-full bg-destructive/15 flex items-center justify-center">
                  <span className="text-destructive text-xs font-bold">x</span>
                </div>
                <span className="text-sm font-medium text-card-foreground flex-1">{item.label}</span>
                <span className="text-sm font-mono font-bold text-destructive">0</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <GameBadge variant="default">Round +0</GameBadge>
            <GameBadge variant="warning">Total {winner.score}</GameBadge>
          </div>
        </GameCard>

        {/* Final Standings */}
        <GameCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Medal className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-card-foreground">Final Standings</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Revealing from the bottom to the top.
          </p>
          <div className="flex flex-col gap-2">
            {revealedStandings.map((player, i) => {
              const isWinner = player.rank === 1
              return (
                <div
                  key={player.name}
                  className={cn(
                    "animate-slide-up flex items-center gap-3 p-4 rounded-xl border transition-all",
                    isWinner
                      ? "bg-primary/8 border-primary/30 shadow-md shadow-primary/10"
                      : "bg-muted/40 border-border"
                  )}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center justify-center w-8">
                    {player.rank === 1 ? (
                      <Crown className="w-6 h-6 text-primary" />
                    ) : player.rank === 2 ? (
                      <Star className="w-5 h-5 text-[hsl(45_95%_52%)]" />
                    ) : (
                      <span className="text-lg font-bold text-muted-foreground">
                        #{player.rank}
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                      isWinner
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent text-accent-foreground"
                    )}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold text-card-foreground flex-1">{player.name}</span>
                  <span
                    className={cn(
                      "text-xl font-bold font-mono",
                      isWinner ? "text-primary" : "text-card-foreground"
                    )}
                  >
                    {player.score.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        </GameCard>

        {/* Bottom Actions */}
        <div className="flex justify-center gap-3">
          <Button
            onClick={() => onNavigate("welcome")}
            variant="outline"
            className="border-border text-card-foreground hover:bg-muted/50"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back To Lobby
          </Button>
          <Button
            onClick={() => onNavigate("welcome")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
          >
            Play Again
          </Button>
        </div>
      </div>
    </GameLayout>
  )
}
