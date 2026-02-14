"use client"

import { useState, useEffect } from "react"
import { Lock, X, GripVertical, Volume2 } from "lucide-react"
import { GameLayout, GameCard, GameBadge, TimerBar, Equalizer, CatMascot } from "./game-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const TIMELINE_YEARS = ["1980", "2000"]

export function ListeningPhaseScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [songTitle, setSongTitle] = useState("")
  const [artist, setArtist] = useState("")
  const [locked, setLocked] = useState(false)
  const [timeLeft, setTimeLeft] = useState(22)
  const totalTime = 30

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      onNavigate("reveal")
    }
  }, [timeLeft, onNavigate])

  const progress = (timeLeft / totalTime) * 100
  const variant = timeLeft <= 5 ? "danger" : timeLeft <= 10 ? "warning" : "default"

  return (
    <GameLayout className="max-w-lg mx-auto">
      <div className="flex flex-col gap-5 animate-slide-up">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GameBadge variant="listening">Round 1</GameBadge>
            <GameBadge variant="default">Score 0</GameBadge>
          </div>
          <GameBadge variant="warning">Listen</GameBadge>
        </div>

        {/* Now Playing */}
        <GameCard className="p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative shrink-0">
              <CatMascot variant="thinking" size="sm" className="animate-wiggle" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Equalizer />
                <span className="text-sm font-semibold text-card-foreground">Now Listening...</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Answer hidden until reveal. Lock your guess for higher points!
              </p>
            </div>
          </div>
          <TimerBar progress={progress} seconds={timeLeft} variant={variant} />
        </GameCard>

        {/* Guess Form */}
        <GameCard className="p-5">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-card-foreground uppercase tracking-wide">
                  Song Title
                </label>
                <Input
                  value={songTitle}
                  onChange={(e) => setSongTitle(e.target.value)}
                  placeholder="Type to search..."
                  disabled={locked}
                  className={cn(
                    "h-11 bg-muted/50 border-border text-card-foreground placeholder:text-muted-foreground",
                    locked && "opacity-60"
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-card-foreground uppercase tracking-wide">
                  Artist
                </label>
                <Input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Type to search..."
                  disabled={locked}
                  className={cn(
                    "h-11 bg-muted/50 border-border text-card-foreground placeholder:text-muted-foreground",
                    locked && "opacity-60"
                  )}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => setLocked(!locked)}
                disabled={!songTitle && !artist}
                className={cn(
                  "h-10 font-bold shadow-md transition-all",
                  locked
                    ? "bg-[hsl(155_65%_40%)] text-white hover:bg-[hsl(155_65%_40%)]/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20"
                )}
              >
                <Lock className="w-4 h-4 mr-1.5" />
                {locked ? "Locked!" : "Lock Guess"}
              </Button>
              {!locked && (
                <Button
                  onClick={() => {
                    setSongTitle("")
                    setArtist("")
                  }}
                  variant="outline"
                  className="h-10 border-border text-card-foreground hover:bg-muted/50"
                >
                  <X className="w-4 h-4 mr-1.5" />
                  Clear
                </Button>
              )}
              {locked && (
                <GameBadge variant="success">Guess locked - faster = more points!</GameBadge>
              )}
              {!locked && !songTitle && !artist && (
                <span className="text-xs text-muted-foreground">Waiting for your guess</span>
              )}
            </div>
          </div>
        </GameCard>

        {/* Timeline Placement */}
        <GameCard className="p-5">
          <h3 className="font-bold text-sm text-card-foreground mb-1">Timeline Placement</h3>
          <p className="text-xs text-muted-foreground mb-4">
            {locked ? "Drag to place the release year between items" : "Lock your guess to unlock timeline"}
          </p>

          <div className={cn("flex flex-col gap-2", !locked && "opacity-40 pointer-events-none")}>
            {/* Draggable item */}
            <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5">
              <GripVertical className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-primary">Release year</span>
            </div>

            {/* Fixed timeline items */}
            {TIMELINE_YEARS.map((year) => (
              <div
                key={year}
                className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-border"
              >
                <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                <span className="text-sm font-mono font-bold text-card-foreground">{year}</span>
              </div>
            ))}
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
            onClick={() => onNavigate("reveal")}
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
