"use client"

import { useState } from "react"
import { ArrowLeft, ArrowRight, Link2, RefreshCw, Music2, Check } from "lucide-react"
import { GameLayout, GameCard, GameTitle, GameSubtitle, GameBadge, CatMascot } from "./game-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const PLAYLISTS = [
  { id: "core-pop", name: "Core Pop", version: "v1", songs: 5, selected: true },
  { id: "mega-mix", name: "Mega Mix", version: "v1", songs: 353, selected: false },
]

const ROUND_PRESETS = [10, 20, 30, 50]

export function HostSetupScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [roomCode] = useState("2321")
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>(["core-pop"])
  const [roundCount, setRoundCount] = useState(5)
  const [customRounds, setCustomRounds] = useState("5")
  const [spotifyConnected, setSpotifyConnected] = useState(false)

  const totalSongs = PLAYLISTS.filter((p) => selectedPlaylists.includes(p.id)).reduce(
    (acc, p) => acc + p.songs,
    0
  )

  return (
    <GameLayout className="max-w-lg mx-auto">
      <div className="flex flex-col items-center gap-6 animate-slide-up">
        <CatMascot variant="default" size="sm" />
        <div className="flex flex-col items-center gap-2">
          <GameTitle className="text-2xl md:text-3xl">Host Setup</GameTitle>
          <GameSubtitle>Configure your game room and playlist</GameSubtitle>
        </div>

        <GameCard className="w-full p-6">
          <div className="flex flex-col gap-6">
            {/* Spotify Connection */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  spotifyConnected ? "bg-[hsl(155_65%_40%)]/15" : "bg-primary/10"
                )}>
                  <Music2 className={cn(
                    "w-5 h-5",
                    spotifyConnected ? "text-[hsl(155_65%_40%)]" : "text-primary"
                  )} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-card-foreground">
                    {spotifyConnected ? "Spotify Connected" : "Connect Spotify"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Premium required for playback
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setSpotifyConnected(!spotifyConnected)}
                variant={spotifyConnected ? "outline" : "default"}
                size="sm"
                className={cn(
                  spotifyConnected
                    ? "border-border text-card-foreground hover:bg-muted/50"
                    : "bg-[hsl(155_65%_40%)] text-white hover:bg-[hsl(155_65%_40%)]/90"
                )}
              >
                {spotifyConnected ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Refresh
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5 mr-1.5" />
                    Connect
                  </>
                )}
              </Button>
            </div>

            {/* Room Code */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-semibold text-card-foreground">Room Code</Label>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center">
                  <span className="text-2xl font-mono font-bold tracking-[0.3em] text-primary">
                    {roomCode}
                  </span>
                </div>
              </div>
            </div>

            {/* Playlist Selection */}
            <div className="flex flex-col gap-3">
              <Label className="text-sm font-semibold text-card-foreground">Playlist Packs</Label>
              <div className="flex flex-col gap-2">
                {PLAYLISTS.map((playlist) => {
                  const isSelected = selectedPlaylists.includes(playlist.id)
                  return (
                    <button
                      key={playlist.id}
                      onClick={() =>
                        setSelectedPlaylists((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== playlist.id)
                            : [...prev, playlist.id]
                        )
                      }
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                        isSelected
                          ? "bg-primary/8 border-primary/30"
                          : "bg-muted/30 border-border hover:border-primary/20"
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/30"
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-card-foreground">{playlist.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {playlist.songs} songs
                        </p>
                      </div>
                      <GameBadge variant="default" className="text-[10px]">
                        {playlist.version}
                      </GameBadge>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected: {totalSongs} songs available
              </p>
            </div>

            {/* Round Count */}
            <div className="flex flex-col gap-3">
              <Label className="text-sm font-semibold text-card-foreground">Songs per Game</Label>
              <div className="flex flex-wrap gap-2">
                {ROUND_PRESETS.map((count) => (
                  <button
                    key={count}
                    onClick={() => {
                      setRoundCount(count)
                      setCustomRounds(String(count))
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-semibold transition-all border",
                      roundCount === count
                        ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                        : "bg-muted/50 text-card-foreground border-border hover:border-primary/30"
                    )}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Custom:</span>
                <Input
                  type="number"
                  value={customRounds}
                  onChange={(e) => {
                    setCustomRounds(e.target.value)
                    const num = parseInt(e.target.value)
                    if (!isNaN(num) && num > 0) setRoundCount(num)
                  }}
                  className="w-20 h-9 text-center text-sm bg-muted/50 border-border text-card-foreground"
                  min={1}
                  max={totalSongs || 50}
                />
                <span className="text-xs text-muted-foreground">
                  (max {totalSongs || 50})
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => onNavigate("host-lobby")}
                disabled={!spotifyConnected || selectedPlaylists.length === 0}
                className="flex-1 h-12 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 font-bold text-base disabled:opacity-40"
                size="lg"
              >
                Continue to Lobby
                <ArrowRight className="w-5 h-5 ml-2" />
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
