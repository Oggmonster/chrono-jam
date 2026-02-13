import { type FormEvent, useEffect, useState } from "react";
import type { Route } from "./+types/host-setup";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
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
    setRoomCode((current) => current || oauthRoom || generateRoomCode());
    if (oauthPlaylists.length > 0) {
      setSelectedPlaylistIds((current) => (current.length > 0 ? current : oauthPlaylists));
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
          playlists?: Array<{ id?: string; name?: string; version?: number }>;
        };
        if (cancelled || payload.kind !== "playlist-catalog" || !Array.isArray(payload.playlists)) {
          return;
        }

        const entries = payload.playlists
          .filter(
            (entry): entry is { id: string; name: string; version: number } =>
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

    navigate(`/host/lobby/${normalized}?playlists=${encodeURIComponent(safePlaylistIds.join(","))}`);
  };

  const connectHref = `/auth/spotify/start?room=${encodeURIComponent(normalizeRoomCode(roomCode) || "")}&playlists=${encodeURIComponent(selectedPlaylistIds.join(","))}`;

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
                  {(playlistCatalog.length > 0
                    ? playlistCatalog
                    : [{ id: "core-pop", name: "Core Pop", version: 1 }]
                  ).map((entry) => (
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
                        {entry.name} ({entry.id}.v{entry.version})
                      </span>
                    </label>
                  ))}
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

