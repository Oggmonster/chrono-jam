"use client"

import { useState, useEffect } from "react"
import { Play, SkipForward, RotateCcw, Pause, Wifi, ArrowLeft } from "lucide-react"
import { GameLayout, GameCard, GameBadge, TimerBar, Equalizer, PlayerAvatar, CatMascot } from "./game-layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function HostControlScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [phase] = useState<"listen" | "reveal" | "intermission">("listen")
  const [timeLeft, setTimeLeft] = useState(38)
  const totalTime = 40

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [timeLeft])

  const progress = (timeLeft / totalTime) * 100
  const variant = timeLeft <= 5 ? "danger" : timeLeft <= 10 ? "warning" : "default"

  const players = [
    { name: "Marty", score: 0 },
    { name: "Alex", score: 200 },
    { name: "Jordan", score: 150 },
  ].sort((a, b) => b.score - a.score)

  return (
    <GameLayout className="max-w-3xl mx-auto">
      <div className="flex flex-col gap-5 animate-slide-up">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GameBadge variant="warning">Host Control</GameBadge>
          </div>
          <div className="flex items-center gap-2">
            <GameBadge variant="listening">Round 1/5</GameBadge>
            <GameBadge variant={phase === "listen" ? "info" : phase === "reveal" ? "success" : "default"}>
              {phase === "listen" ? "Listen" : phase === "reveal" ? "Reveal" : "Intermission"}
            </GameBadge>
          </div>
        </div>

        {/* Phase Timer & Now Playing */}
        <GameCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-card-foreground">Phase Timer</h3>
            <span className="text-xs text-muted-foreground font-mono">
              {"Open '/play/game/6095' to verify sync"}
            </span>
          </div>
          <TimerBar progress={progress} seconds={timeLeft} variant={variant} />

          <div className="mt-4 p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <CatMascot variant="thinking" size="sm" className="animate-wiggle" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Equalizer />
                  <span className="text-sm font-semibold text-card-foreground">Now Listening...</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Song details hidden for fairness</p>
              </div>
            </div>
          </div>
        </GameCard>

        {/* Controls Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Round Controls */}
          <GameCard className="p-5">
            <h3 className="font-bold text-card-foreground mb-4">Round Controls</h3>
            <div className="flex flex-wrap gap-2">
              <Button className="bg-[hsl(155_65%_40%)] text-white hover:bg-[hsl(155_65%_40%)]/90 font-bold shadow-md">
                <Play className="w-4 h-4 mr-1.5" />
                Start
              </Button>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold">
                <SkipForward className="w-4 h-4 mr-1.5" />
                Skip Phase
              </Button>
              <Button variant="outline" className="border-border text-card-foreground hover:bg-muted/50">
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Reset
              </Button>
              <Button variant="outline" className="border-border text-card-foreground hover:bg-muted/50">
                <Wifi className="w-4 h-4 mr-1.5" />
                Force Sync
              </Button>
            </div>
          </GameCard>

          {/* Playback Control */}
          <GameCard className="p-5">
            <h3 className="font-bold text-card-foreground mb-4">Spotify Playback</h3>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border">
                <div className="w-2.5 h-2.5 rounded-full bg-[hsl(155_65%_40%)]" />
                <span className="text-sm text-card-foreground">Connected & Ready</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-[hsl(200_75%_50%)] text-white hover:bg-[hsl(200_75%_50%)]/90">
                  <Play className="w-3.5 h-3.5 mr-1" />
                  Play Clip
                </Button>
                <Button size="sm" variant="outline" className="border-border text-card-foreground hover:bg-muted/50">
                  <Pause className="w-3.5 h-3.5 mr-1" />
                  Pause
                </Button>
              </div>
            </div>
          </GameCard>
        </div>

        {/* Live Leaderboard */}
        <GameCard className="p-5">
          <h3 className="font-bold text-card-foreground mb-4">Live Leaderboard</h3>
          <div className="flex flex-col gap-2 stagger-children">
            {players.map((player, i) => (
              <PlayerAvatar
                key={player.name}
                name={player.name}
                score={player.score}
                rank={i + 1}
                highlight={i === 0}
              />
            ))}
          </div>
        </GameCard>

        {/* Bottom Actions */}
        <div className="flex justify-center gap-3">
          <Button
            onClick={() => onNavigate("host-lobby")}
            variant="outline"
            size="sm"
            className="border-border text-card-foreground hover:bg-muted/50"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back To Lobby
          </Button>
        </div>
      </div>
    </GameLayout>
  )
}
