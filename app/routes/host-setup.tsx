import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { Route } from "./+types/host-setup";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Check, Link2, Music2, RefreshCw } from "lucide-react";

import { CatMascot, GameCard, GameLayout, GameSubtitle, GameTitle } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  clampGameSongCount,
  defaultGameSongCount,
  gameSongCountPresets,
  parseGameSongCount,
} from "~/lib/game-settings";
import { generateRoomCode, normalizeRoomCode } from "~/lib/room-code";
import {
  readStoredSpotifyToken,
  resolveSpotifyAccessToken,
  refreshSpotifyAccessToken,
  storeSpotifyToken,
} from "~/lib/spotify-token";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Host Setup" }];
}

type PlaylistCatalogEntry = {
  id: string;
  name: string;
  version: number;
  roundCount: number;
};

export default function HostSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState("");
  const [token, setToken] = useState("");
  const [statusText, setStatusText] = useState("");
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [playlistCatalog, setPlaylistCatalog] = useState<PlaylistCatalogEntry[]>([]);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [requestedSongCount, setRequestedSongCount] = useState(defaultGameSongCount);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = readStoredSpotifyToken();
    if (stored.accessToken) {
      setToken(stored.accessToken);
    }

    void resolveSpotifyAccessToken()
      .then(({ accessToken, source }) => {
        setToken(accessToken);
        if (!stored.accessToken) {
          setStatusText("Spotify token loaded.");
          return;
        }

        if (source === "refresh") {
          setStatusText("Spotify token refreshed.");
        }
      })
      .catch(() => {
        if (!stored.accessToken) {
          setStatusText("Spotify token missing. Please connect Spotify.");
        }
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const oauthToken = searchParams.get("spotify_access_token");
    const oauthExpiry = searchParams.get("spotify_expires_in");
    const oauthError = searchParams.get("spotify_error");
    const oauthRoom = normalizeRoomCode(searchParams.get("room") ?? "");
    const oauthPlaylists = (searchParams.get("playlists") ?? "")
      .split(",")
      .map((playlistId) => playlistId.trim())
      .filter((playlistId) => playlistId.length > 0);
    const oauthSongCount = parseGameSongCount(searchParams.get("songs"));
    setRoomCode((current) => current || oauthRoom || generateRoomCode());
    if (oauthPlaylists.length > 0) {
      setSelectedPlaylistIds((current) => (current.length > 0 ? current : oauthPlaylists));
    }
    if (oauthSongCount !== null) {
      setRequestedSongCount(oauthSongCount);
    }

    if (oauthError) {
      setStatusText(`Spotify auth error: ${oauthError}`);
      return;
    }

    if (!oauthToken) {
      return;
    }

    setToken(oauthToken);
    if (oauthExpiry) {
      storeSpotifyToken(oauthToken, Number(oauthExpiry));
      setStatusText("Spotify connected. Access token saved.");
    } else {
      storeSpotifyToken(oauthToken, 60 * 60);
      setStatusText("Spotify connected. Access token saved.");
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      try {
        const response = await fetch("/game-data/playlists/index.json", {
          method: "GET",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          kind?: string;
          playlists?: Array<{ id?: string; name?: string; version?: number; roundCount?: number }>;
        };
        if (cancelled || payload.kind !== "playlist-catalog" || !Array.isArray(payload.playlists)) {
          return;
        }

        const entries = payload.playlists
          .filter(
            (entry): entry is { id: string; name: string; version: number; roundCount?: number } =>
              typeof entry?.id === "string" &&
              entry.id.trim().length > 0 &&
              typeof entry?.name === "string" &&
              entry.name.trim().length > 0 &&
              typeof entry?.version === "number" &&
              Number.isFinite(entry.version),
          )
          .map((entry) => ({
            id: entry.id.trim(),
            name: entry.name.trim(),
            version: Math.floor(entry.version),
            roundCount:
              typeof entry.roundCount === "number" && Number.isFinite(entry.roundCount) && entry.roundCount > 0
                ? Math.floor(entry.roundCount)
                : 0,
          }));

        setPlaylistCatalog(entries);
        setSelectedPlaylistIds((current) => {
          if (current.length > 0) {
            return current;
          }
          return entries.length > 0 ? [entries[0]!.id] : ["core-pop"];
        });
      } catch {
        // Keep defaults if catalog fetch fails.
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  const playlistEntries = useMemo<PlaylistCatalogEntry[]>(() => {
    const baseEntries =
      playlistCatalog.length > 0
        ? playlistCatalog
        : [{ id: "core-pop", name: "Core Pop", version: 1, roundCount: 5 }];
    const knownIds = new Set(baseEntries.map((entry) => entry.id));
    const missingSelected = selectedPlaylistIds
      .filter((playlistId) => !knownIds.has(playlistId))
      .map((playlistId) => ({
        id: playlistId,
        name: playlistId,
        version: 1,
        roundCount: defaultGameSongCount,
      }));

    return [...baseEntries, ...missingSelected];
  }, [playlistCatalog, selectedPlaylistIds]);

  const selectedRoundCapacity = useMemo(() => {
    if (selectedPlaylistIds.length === 0) {
      return defaultGameSongCount;
    }

    const roundCountByPlaylistId = new Map(playlistEntries.map((entry) => [entry.id, entry.roundCount] as const));
    const selectedTotal = selectedPlaylistIds.reduce((total, playlistId) => {
      return total + (roundCountByPlaylistId.get(playlistId) ?? 0);
    }, 0);

    return selectedTotal > 0 ? selectedTotal : defaultGameSongCount;
  }, [playlistEntries, selectedPlaylistIds]);

  useEffect(() => {
    setRequestedSongCount((current) =>
      clampGameSongCount(current, selectedRoundCapacity, defaultGameSongCount),
    );
  }, [selectedRoundCapacity]);

  const selectedGameSongCount = useMemo(
    () => clampGameSongCount(requestedSongCount, selectedRoundCapacity, defaultGameSongCount),
    [requestedSongCount, selectedRoundCapacity],
  );

  const refreshToken = () => {
    setRefreshingToken(true);
    void refreshSpotifyAccessToken()
      .then(({ accessToken, expiresIn }) => {
        storeSpotifyToken(accessToken, expiresIn);
        setToken(accessToken);
        setStatusText("Spotify token refreshed.");
      })
      .catch(() => {
        setStatusText("Spotify token refresh failed. Reconnect Spotify.");
      })
      .finally(() => {
        setRefreshingToken(false);
      });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalized = normalizeRoomCode(roomCode) || generateRoomCode();
    const safePlaylistIds = selectedPlaylistIds.length > 0 ? selectedPlaylistIds : ["core-pop"];

    if (typeof window !== "undefined") {
      const trimmedToken = token.trim();
      if (trimmedToken) {
        const stored = readStoredSpotifyToken();
        if (stored.accessToken !== trimmedToken) {
          storeSpotifyToken(trimmedToken, 5 * 60);
          setStatusText("Manual token saved. Connect Spotify if playback fails.");
        }
      } else {
        try {
          const resolved = await resolveSpotifyAccessToken();
          setToken(resolved.accessToken);
          if (resolved.source === "refresh") {
            setStatusText("Spotify token refreshed.");
          }
        } catch {
          setStatusText("No valid Spotify token. Connect Spotify before continuing.");
          return;
        }
      }
    }

    const target = new URLSearchParams();
    target.set("playlists", safePlaylistIds.join(","));
    target.set("songs", String(selectedGameSongCount));
    navigate(`/host/lobby/${normalized}?${target.toString()}`);
  };

  const connectParams = new URLSearchParams();
  connectParams.set("room", normalizeRoomCode(roomCode) || "");
  connectParams.set("playlists", selectedPlaylistIds.join(","));
  connectParams.set("songs", String(selectedGameSongCount));
  const connectHref = `/auth/spotify/start?${connectParams.toString()}`;

  return (
    <GameLayout className="mx-auto max-w-lg">
      <div className="animate-slide-up flex flex-col items-center gap-6">
        <CatMascot variant="default" size="sm" />
        <div className="flex flex-col items-center gap-2">
          <GameTitle className="text-2xl md:text-3xl">Host Setup</GameTitle>
          <GameSubtitle>Configure your game room and playlist</GameSubtitle>
        </div>

        <GameCard className="w-full p-6">
          <form className="flex flex-col gap-6" onSubmit={submit}>
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)]">
                  <Music2 className="h-5 w-5 text-[hsl(var(--primary))]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-card-foreground">
                    {token.trim() ? "Spotify Connected" : "Connect Spotify"}
                  </p>
                  <p className="text-xs text-muted-foreground">Premium required for playback</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" className="bg-[hsl(155_65%_40%)] text-white hover:bg-[hsl(155_65%_40%/0.9)]">
                  <a href={connectHref}>
                    <Link2 className="h-3.5 w-3.5" />
                    Connect
                  </a>
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={refreshToken} disabled={refreshingToken}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {refreshingToken ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>

            {statusText ? <Badge variant="success" className="w-fit">{statusText}</Badge> : null}

            <label className="flex flex-col gap-2 text-sm font-semibold text-card-foreground">
              Room Code
              <div className="flex h-12 items-center justify-center rounded-xl border border-border bg-muted/40">
                <span className="font-mono text-2xl font-bold tracking-[0.3em] text-[hsl(var(--primary))]">
                  {normalizeRoomCode(roomCode) || "----"}
                </span>
              </div>
            </label>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-card-foreground">Playlist Packs</p>
              <div className="flex flex-col gap-2">
                {playlistEntries.map((entry) => {
                  const selected = selectedPlaylistIds.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSelectedPlaylistIds((current) => {
                          const next = selected
                            ? current.filter((id) => id !== entry.id)
                            : [...new Set([...current, entry.id])];
                          return next.length > 0 ? next : current;
                        });
                      }}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                        selected
                          ? "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.08)]"
                          : "border-border bg-muted/30"
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                          selected
                            ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {selected ? <Check className="h-3 w-3 text-[hsl(var(--primary-foreground))]" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-card-foreground">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">{entry.roundCount} songs</p>
                      </div>
                      <Badge className="text-[10px]">{`v${entry.version}`}</Badge>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Selected: {selectedRoundCapacity} songs available</p>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-card-foreground">Songs per Game</p>
              <div className="flex flex-wrap gap-2">
                {gameSongCountPresets.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant={requestedSongCount === preset ? "default" : "outline"}
                    onClick={() => setRequestedSongCount(preset)}
                    disabled={preset > selectedRoundCapacity}
                    className={requestedSongCount === preset ? "shadow-md shadow-primary/20" : ""}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Custom:</span>
                <Input
                  type="number"
                  min={1}
                  max={selectedRoundCapacity}
                  step={1}
                  value={requestedSongCount}
                  onChange={(event) => {
                    const parsed = parseGameSongCount(event.target.value);
                    if (parsed === null) {
                      return;
                    }
                    setRequestedSongCount(clampGameSongCount(parsed, selectedRoundCapacity, defaultGameSongCount));
                  }}
                  className="h-9 w-20 text-center"
                />
                <span>{`(max ${selectedRoundCapacity})`}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Using {selectedGameSongCount} songs (max {selectedRoundCapacity})
              </p>
            </div>

            <details className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-card-foreground">Advanced token override</summary>
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1 text-xs font-semibold text-card-foreground">
                  Custom room code
                  <Input
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value)}
                    placeholder="e.g. 2321"
                    maxLength={8}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-card-foreground">
                  Access token
                  <Input
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Paste OAuth access token"
                  />
                </label>
              </div>
            </details>

            <div className="flex gap-3 pt-2">
              <Button type="submit" size="lg" className="h-12 flex-1" disabled={selectedPlaylistIds.length === 0}>
                Continue to Lobby
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12">
                <Link to="/">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </form>
        </GameCard>
      </div>
    </GameLayout>
  );
}

