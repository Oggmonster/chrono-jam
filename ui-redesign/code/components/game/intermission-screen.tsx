"use client"

import { useState, useEffect } from "react"
import { Quote } from "lucide-react"
import { GameLayout, GameCard, GameBadge, TimerBar, Equalizer, CatMascot } from "./game-layout"
import { Button } from "@/components/ui/button"

const WISDOM_QUOTES = [
  "One chorus can turn strangers into a crowd.",
  "Music is the shorthand of emotion.",
  "Where words fail, music speaks.",
  "The song you can't name is the one you'll never forget.",
  "Every earworm was once a first listen.",
  "The best playlists tell a story.",
  "A good bassline fixes everything.",
  "Humming counts as knowing the song... right?",
]

export function IntermissionScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [timeLeft, setTimeLeft] = useState(10)
  const totalTime = 10
  const [quote] = useState(() => WISDOM_QUOTES[Math.floor(Math.random() * WISDOM_QUOTES.length)])

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      onNavigate("listening")
    }
  }, [timeLeft, onNavigate])

  const progress = (timeLeft / totalTime) * 100

  return (
    <GameLayout className="max-w-lg mx-auto">
      <div className="flex flex-col gap-6 animate-slide-up">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GameBadge variant="listening">Round 2</GameBadge>
            <GameBadge variant="default">Score 200</GameBadge>
          </div>
          <GameBadge variant="warning">Intermission</GameBadge>
        </div>

        {/* Main Intermission Card */}
        <GameCard className="p-8 text-center">
          <div className="flex flex-col items-center gap-6">
            {/* Cat mascot with speech bubble */}
            <div className="relative">
              <CatMascot variant="chill" size="lg" className="animate-float" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-card-foreground mb-2">Intermission</h2>
              <p className="text-sm text-muted-foreground">
                Quick vibe check before the next song
              </p>
            </div>

            <Equalizer className="h-8" />

            {/* Countdown */}
            <div className="flex items-center justify-center">
              <div className="w-20 h-20 rounded-full border-4 border-primary/25 flex items-center justify-center bg-primary/5">
                <span className="text-3xl font-mono font-bold text-primary animate-count-pulse">
                  {timeLeft}
                </span>
              </div>
            </div>

            {/* Wisdom Quote - speech bubble from cat */}
            <div className="relative p-4 rounded-2xl bg-muted/50 border border-border max-w-sm">
              {/* Speech bubble pointer */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-muted/50 border-l border-t border-border rotate-45" />
              <div className="relative">
                <Quote className="w-4 h-4 text-primary/40 absolute -top-0.5 -left-0.5" />
                <p className="text-sm text-card-foreground italic pl-5 leading-relaxed">
                  {`"${quote}"`}
                </p>
                <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider pl-5 font-semibold">
                  Cat Wisdom
                </p>
              </div>
            </div>

            <TimerBar progress={progress} seconds={timeLeft} variant="default" className="w-full" />
          </div>
        </GameCard>

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
