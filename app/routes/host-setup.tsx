import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { Route } from "./+types/host-setup";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  clampGameSongCount,
  defaultGameSongCount,
  gameSongCountPresets,
  parseGameSongCount,
} from "~/lib/game-settings";
import { generateRoomCode, normalizeRoomCode } from "~/lib/room-code";
import {
  isTokenExpiring,
  readStoredSpotifyToken,
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

    if (stored.accessToken && isTokenExpiring(stored.expiresAt)) {
      void refreshSpotifyAccessToken()
        .then(({ accessToken, expiresIn }) => {
          storeSpotifyToken(accessToken, expiresIn);
          setToken(accessToken);
          setStatusText("Spotify token refreshed.");
        })
        .catch(() => {
          setStatusText("Spotify token expired. Please reconnect Spotify.");
        });
    }
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
        const stored = readStoredSpotifyToken();
        if (!stored.accessToken) {
          try {
            const refreshed = await refreshSpotifyAccessToken();
            storeSpotifyToken(refreshed.accessToken, refreshed.expiresIn);
            setToken(refreshed.accessToken);
            setStatusText("Spotify token refreshed.");
          } catch {
            setStatusText("No valid Spotify token. Connect Spotify before continuing.");
            return;
          }
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
    <main className="jam-page">
      <section className="jam-stage w-full max-w-3xl">
        <Ribbon>Host Setup</Ribbon>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Spotify Premium Host</CardTitle>
            <CardDescription>
              ChronoJam host playback uses the Spotify Web Playback SDK.
            </CardDescription>
            <Badge variant="warning" className="w-fit">
              Required scopes: streaming, user-modify-playback-state, user-read-playback-state, playlist-read-private, playlist-read-collaborative
            </Badge>
            {statusText ? <Badge variant="success" className="w-fit">{statusText}</Badge> : null}
          </CardHeader>

          <CardContent>
            <form className="grid gap-4" onSubmit={submit}>
              <label className="grid gap-2 text-sm font-bold text-[#32277e]">
                Room code
                <Input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value)}
                  placeholder="8372"
                  maxLength={8}
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-[#32277e]">
                Spotify access token
                <Input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Paste OAuth access token"
                />
              </label>
              <div className="grid gap-2 text-sm font-bold text-[#32277e]">
                <p>Playlist packs</p>
                <div className="grid gap-2 rounded-xl border-2 border-[#29459c] bg-[#eef4ff] p-3">
                  {playlistEntries.map((entry) => (
                    <label key={entry.id} className="flex items-center gap-2 text-sm font-semibold text-[#1f1f55]">
                      <input
                        type="checkbox"
                        checked={selectedPlaylistIds.includes(entry.id)}
                        onChange={(event) => {
                          setSelectedPlaylistIds((current) => {
                            const next = event.target.checked
                              ? [...new Set([...current, entry.id])]
                              : current.filter((id) => id !== entry.id);
                            return next.length > 0 ? next : current;
                          });
                        }}
                      />
                      <span>
                        {entry.name} ({entry.id}.v{entry.version}) | {entry.roundCount} songs
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs font-semibold text-[#4f5fa2]">
                  Selected pack size: {selectedRoundCapacity} songs
                </p>
              </div>

              <div className="grid gap-2 text-sm font-bold text-[#32277e]">
                <p>Songs in this game</p>
                <div className="grid gap-2 rounded-xl border-2 border-[#29459c] bg-[#eef4ff] p-3">
                  <div className="flex flex-wrap gap-2">
                    {gameSongCountPresets.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant={requestedSongCount === preset ? "default" : "outline"}
                        onClick={() => setRequestedSongCount(preset)}
                        disabled={preset > selectedRoundCapacity}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                  <label className="grid gap-1 text-xs font-semibold text-[#1f1f55]">
                    Custom
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
                        setRequestedSongCount(
                          clampGameSongCount(parsed, selectedRoundCapacity, defaultGameSongCount),
                        );
                      }}
                    />
                  </label>
                  <p className="text-xs font-semibold text-[#4f5fa2]">
                    Using {selectedGameSongCount} songs (max {selectedRoundCapacity})
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-3">
                <Button asChild variant="default" size="lg">
                  <a href={connectHref}>Connect Spotify</a>
                </Button>
                <Button type="button" variant="outline" onClick={refreshToken} disabled={refreshingToken}>
                  {refreshingToken ? "Refreshing..." : "Refresh Token"}
                </Button>
                <Button type="submit" variant="success" size="lg">
                  Continue To Lobby
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/">Back</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

