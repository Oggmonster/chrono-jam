"use client"

import { useState } from "react"
import { Play, RotateCcw, Users, Shield, Wifi, Copy, CheckCheck } from "lucide-react"
import { GameLayout, GameCard, GameTitle, GameSubtitle, GameBadge, CatMascot } from "./game-layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function HostLobbyScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [copied, setCopied] = useState(false)
  const [players] = useState([
    { name: "Marty", ready: true },
    { name: "Alex", ready: true },
    { name: "Jordan", ready: false },
  ])

  const readyCount = players.filter((p) => p.ready).length
  const allReady = readyCount === players.length && players.length > 0

  const copyCode = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <GameLayout className="max-w-2xl mx-auto">
      <div className="flex flex-col items-center gap-6 animate-slide-up">
        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <GameBadge variant="warning">Host</GameBadge>
          <GameTitle className="text-2xl md:text-3xl">Game Lobby</GameTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>mega-mix</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
            <span>5 songs</span>
          </div>
        </div>

        {/* Room Code - prominent */}
        <GameCard className="w-full max-w-sm p-6 text-center" glow>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 font-semibold">
            Room Code
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-5xl font-mono font-bold tracking-[0.25em] text-primary">
              6095
            </span>
            <button
              onClick={copyCode}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-card-foreground"
              aria-label="Copy room code"
            >
              {copied ? (
                <CheckCheck className="w-5 h-5 text-[hsl(155_65%_40%)]" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Share this with your players</p>
        </GameCard>

        {/* Players & Status Grid */}
        <div className="w-full grid md:grid-cols-2 gap-4">
          {/* Players List */}
          <GameCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-card-foreground">Players</h3>
              </div>
              <GameBadge variant={allReady ? "success" : "default"}>
                {readyCount}/{players.length} ready
              </GameBadge>
            </div>
            <div className="flex flex-col gap-2 stagger-children">
              {players.length === 0 ? (
                <div className="flex flex-col items-center py-6 gap-3">
                  <CatMascot variant="thinking" size="sm" />
                  <p className="text-sm text-muted-foreground text-center">
                    Waiting for players to join...
                  </p>
                </div>
              ) : (
                players.map((player) => (
                  <div
                    key={player.name}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-all",
                      player.ready
                        ? "bg-[hsl(155_65%_40%)]/8 border-[hsl(155_65%_40%)]/25"
                        : "bg-muted/40 border-border"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-primary text-primary-foreground">
                      {player.name.charAt(0)}
                    </div>
                    <span className="font-semibold text-sm text-card-foreground flex-1">
                      {player.name}
                    </span>
                    {player.ready ? (
                      <GameBadge variant="success" className="text-[10px]">Ready</GameBadge>
                    ) : (
                      <GameBadge variant="default" className="text-[10px]">Loading...</GameBadge>
                    )}
                  </div>
                ))
              )}
            </div>
          </GameCard>

          {/* Status Panel */}
          <GameCard className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-accent" />
              <h3 className="font-bold text-card-foreground">System Status</h3>
            </div>
            <div className="flex flex-col gap-3">
              <StatusItem label="Spotify Token" status="connected" detail="Host token active" />
              <StatusItem label="Game Pack" status="ready" detail="5 songs loaded" />
              <StatusItem
                label="Player Sync"
                status={allReady ? "ready" : "waiting"}
                detail={allReady ? "All synced" : "Waiting for players"}
              />
            </div>
          </GameCard>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() => onNavigate("host-control")}
            disabled={!allReady}
            className={cn(
              "h-12 px-8 font-bold text-base shadow-lg transition-all",
              allReady
                ? "bg-[hsl(155_65%_40%)] text-white hover:bg-[hsl(155_65%_40%)]/90 shadow-[hsl(155_65%_40%)]/20 animate-pulse-glow"
                : "bg-muted text-muted-foreground"
            )}
            size="lg"
          >
            <Play className="w-5 h-5 mr-2" />
            Start Game
          </Button>
          <Button
            onClick={() => onNavigate("host-setup")}
            variant="outline"
            className="h-12 border-border text-card-foreground hover:bg-muted/50"
            size="lg"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>
    </GameLayout>
  )
}

function StatusItem({
  label,
  status,
  detail,
}: {
  label: string
  status: "connected" | "ready" | "waiting" | "error"
  detail: string
}) {
  const statusColors = {
    connected: "bg-[hsl(155_65%_40%)]",
    ready: "bg-[hsl(155_65%_40%)]",
    waiting: "bg-[hsl(45_95%_52%)]",
    error: "bg-destructive",
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
      <div className="relative">
        <Wifi className="w-4 h-4 text-muted-foreground" />
        <div
          className={cn(
            "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
            statusColors[status]
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-card-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}
