"use client"

import { useState } from "react"
import { Headphones, Users } from "lucide-react"
import { GameLayout, GameCard, GameTitle, GameSubtitle, CatMascot } from "./game-layout"
import { Button } from "@/components/ui/button"

export function WelcomeScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)

  return (
    <GameLayout className="max-w-lg mx-auto">
      <div className="flex flex-col items-center gap-8 animate-slide-up">
        {/* Logo / Title with Mascot */}
        <div className="flex flex-col items-center gap-4">
          <CatMascot variant="default" size="lg" className="animate-float" />
          <GameTitle>ChronoJam</GameTitle>
          <GameSubtitle>
            Guess the song, name the artist, place the year. Play with friends!
          </GameSubtitle>
        </div>

        {/* Action Cards */}
        <div className="w-full flex flex-col gap-4">
          <GameCard
            className="p-6 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-primary/40"
            glow={hoveredCard === "host"}
            onMouseEnter={() => setHoveredCard("host")}
            onMouseLeave={() => setHoveredCard(null)}
            onClick={() => onNavigate("host-setup")}
          >
            <div className="flex items-start gap-4" role="button" tabIndex={0} aria-label="Host a game">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Headphones className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-card-foreground">Host a Game</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Set up a room, pick a playlist, and control the game. Requires Spotify Premium.
                </p>
                <Button
                  className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                  size="lg"
                >
                  Open Host Setup
                </Button>
              </div>
            </div>
          </GameCard>

          <GameCard
            className="p-6 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-accent/40"
            glow={hoveredCard === "player"}
            onMouseEnter={() => setHoveredCard("player")}
            onMouseLeave={() => setHoveredCard(null)}
            onClick={() => onNavigate("join-room")}
          >
            <div className="flex items-start gap-4" role="button" tabIndex={0} aria-label="Join a room">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Users className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-card-foreground">Join a Room</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Enter the room code from your host and start guessing songs in real time.
                </p>
                <Button
                  className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90 shadow-md shadow-accent/20"
                  size="lg"
                >
                  Join as Player
                </Button>
              </div>
            </div>
          </GameCard>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Best played on a big screen with friends around
        </p>
      </div>
    </GameLayout>
  )
}
