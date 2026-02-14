"use client"

import { useState } from "react"
import { ArrowLeft, LogIn } from "lucide-react"
import { GameLayout, GameCard, GameTitle, GameSubtitle, CatMascot } from "./game-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function JoinRoomScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [roomCode, setRoomCode] = useState("")
  const [playerName, setPlayerName] = useState("")

  return (
    <GameLayout className="max-w-md mx-auto">
      <div className="flex flex-col items-center gap-6 animate-slide-up">
        <CatMascot variant="thinking" size="md" className="animate-wiggle" />
        <div className="flex flex-col items-center gap-2">
          <GameTitle className="text-2xl md:text-3xl">Join a Room</GameTitle>
          <GameSubtitle>Enter the code shown on the host screen</GameSubtitle>
        </div>

        <GameCard className="w-full p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="room-code" className="text-sm font-semibold text-card-foreground">
                Room Code
              </Label>
              <Input
                id="room-code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. 6095"
                maxLength={6}
                className="text-center text-2xl font-mono font-bold tracking-[0.3em] h-14 bg-muted/50 border-border text-card-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="player-name" className="text-sm font-semibold text-card-foreground">
                Your Name
              </Label>
              <Input
                id="player-name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g. Alex"
                maxLength={20}
                className="h-12 bg-muted/50 border-border text-card-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => onNavigate("player-lobby")}
                disabled={!roomCode || !playerName}
                className="flex-1 h-12 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 font-bold text-base disabled:opacity-40"
                size="lg"
              >
                <LogIn className="w-5 h-5 mr-2" />
                Join Lobby
              </Button>
              <Button
                onClick={() => onNavigate("welcome")}
                variant="outline"
                className="h-12 border-border text-card-foreground hover:bg-muted/50"
                size="lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </GameCard>
      </div>
    </GameLayout>
  )
}
