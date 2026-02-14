"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, Loader2, ArrowLeftRight } from "lucide-react"
import { GameLayout, GameCard, GameTitle, GameBadge, Equalizer, CatMascot } from "./game-layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PlayerLobbyScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [dots, setDots] = useState("")

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."))
    }, 600)
    return () => clearInterval(interval)
  }, [])

  const players = [
    { name: "Marty", ready: true },
    { name: "Alex", ready: true },
    { name: "Jordan", ready: false },
  ]

  return (
    <GameLayout className="max-w-md mx-auto">
      <div className="flex flex-col items-center gap-6 animate-slide-up">
        {/* Cat mascot waiting */}
        <CatMascot variant="chill" size="md" className="animate-float" />

        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <GameBadge variant="info">Player</GameBadge>
          <GameTitle className="text-2xl md:text-3xl">
            {"Waiting for host" + dots}
          </GameTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Room</span>
              <span className="font-mono font-bold text-primary text-lg">6095</span>
            </div>
            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
            <span className="text-sm text-muted-foreground">mega-mix</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
            <span className="text-sm text-muted-foreground">5 songs</span>
          </div>
        </div>

        {/* Players Card */}
        <GameCard className="w-full p-5">
          <h3 className="font-bold text-card-foreground mb-3">Players Connected</h3>
          <div className="flex flex-wrap gap-2 stagger-children">
            {players.map((player) => (
              <div
                key={player.name}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-full border transition-all",
                  player.ready
                    ? "bg-[hsl(155_65%_40%)]/8 border-[hsl(155_65%_40%)]/25"
                    : "bg-muted/40 border-border"
                )}
              >
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                  {player.name.charAt(0)}
                </div>
                <span className="text-sm font-semibold text-card-foreground">{player.name}</span>
                {player.ready ? (
                  <CheckCircle2 className="w-4 h-4 text-[hsl(155_65%_40%)]" />
                ) : (
                  <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                )}
              </div>
            ))}
          </div>
        </GameCard>

        {/* Ready Status */}
        <GameCard className="w-full p-5">
          <h3 className="font-bold text-card-foreground mb-3">Your Status</h3>
          <div className="flex flex-col gap-2">
            <ReadyItem label="Game pack loaded" ready />
            <ReadyItem label="Autocomplete ready" ready />
          </div>
          <div className="mt-4">
            <GameBadge variant="success">Ready</GameBadge>
          </div>
        </GameCard>

        {/* Waiting animation */}
        <div className="flex flex-col items-center gap-3 py-2">
          <Equalizer />
          <p className="text-xs text-muted-foreground">The host will start the game soon</p>
        </div>

        <Button
          onClick={() => onNavigate("join-room")}
          variant="outline"
          className="border-border text-card-foreground hover:bg-muted/50"
        >
          <ArrowLeftRight className="w-4 h-4 mr-2" />
          Change Room
        </Button>
      </div>
    </GameLayout>
  )
}

function ReadyItem({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg">
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
          ready
            ? "bg-[hsl(155_65%_40%)]/15 text-[hsl(155_65%_40%)]"
            : "bg-muted text-muted-foreground"
        )}
      >
        {ready ? <CheckCircle2 className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
      </div>
      <span className="text-sm font-medium text-card-foreground">{label}</span>
    </div>
  )
}
