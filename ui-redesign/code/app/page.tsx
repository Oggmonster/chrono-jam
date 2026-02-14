"use client"

import { useState } from "react"
import { WelcomeScreen } from "@/components/game/welcome-screen"
import { JoinRoomScreen } from "@/components/game/join-room-screen"
import { HostSetupScreen } from "@/components/game/host-setup-screen"
import { HostLobbyScreen } from "@/components/game/host-lobby-screen"
import { HostControlScreen } from "@/components/game/host-control-screen"
import { PlayerLobbyScreen } from "@/components/game/player-lobby-screen"
import { ListeningPhaseScreen } from "@/components/game/listening-phase-screen"
import { RevealPhaseScreen } from "@/components/game/reveal-phase-screen"
import { IntermissionScreen } from "@/components/game/intermission-screen"
import { FinalResultsScreen } from "@/components/game/final-results-screen"

type Screen =
  | "welcome"
  | "join-room"
  | "host-setup"
  | "host-lobby"
  | "host-control"
  | "player-lobby"
  | "listening"
  | "reveal"
  | "intermission"
  | "final"

export default function Page() {
  const [screen, setScreen] = useState<Screen>("welcome")

  const navigate = (target: string) => {
    setScreen(target as Screen)
  }

  return (
    <>
      {/* Screen Navigation Dots (for demo purposes) */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-card/95 backdrop-blur-sm rounded-full px-3 py-2 border border-border shadow-lg">
        {(
          [
            { id: "welcome", label: "Home" },
            { id: "join-room", label: "Join" },
            { id: "host-setup", label: "Setup" },
            { id: "host-lobby", label: "H.Lobby" },
            { id: "host-control", label: "H.Control" },
            { id: "player-lobby", label: "P.Lobby" },
            { id: "listening", label: "Listen" },
            { id: "reveal", label: "Reveal" },
            { id: "intermission", label: "Break" },
            { id: "final", label: "Final" },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            onClick={() => setScreen(s.id)}
            className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
              screen === s.id
                ? "bg-primary text-primary-foreground"
                : "text-card-foreground/60 hover:text-card-foreground hover:bg-muted/50"
            }`}
            title={s.label}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Screens */}
      {screen === "welcome" && <WelcomeScreen onNavigate={navigate} />}
      {screen === "join-room" && <JoinRoomScreen onNavigate={navigate} />}
      {screen === "host-setup" && <HostSetupScreen onNavigate={navigate} />}
      {screen === "host-lobby" && <HostLobbyScreen onNavigate={navigate} />}
      {screen === "host-control" && <HostControlScreen onNavigate={navigate} />}
      {screen === "player-lobby" && <PlayerLobbyScreen onNavigate={navigate} />}
      {screen === "listening" && <ListeningPhaseScreen onNavigate={navigate} />}
      {screen === "reveal" && <RevealPhaseScreen onNavigate={navigate} />}
      {screen === "intermission" && <IntermissionScreen onNavigate={navigate} />}
      {screen === "final" && <FinalResultsScreen onNavigate={navigate} />}
    </>
  )
}
