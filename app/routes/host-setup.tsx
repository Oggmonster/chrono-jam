import { type FormEvent, useEffect, useState } from "react";
import type { Route } from "./+types/host-setup";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Link2, Music2, RefreshCw } from "lucide-react";

import { CatMascot, GameCard, GameLayout, GameSubtitle, GameTitle } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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

export default function HostSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState("");
  const [token, setToken] = useState("");
  const [statusText, setStatusText] = useState("");
  const [refreshingToken, setRefreshingToken] = useState(false);

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

    setRoomCode((current) => current || oauthRoom || generateRoomCode());

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

    navigate(`/host/lobby/${normalized}`);
  };

  const connectParams = new URLSearchParams();
  connectParams.set("room", normalizeRoomCode(roomCode) || "");
  const connectHref = `/auth/spotify/start?${connectParams.toString()}`;

  return (
    <GameLayout className="mx-auto max-w-lg">
      <div className="animate-slide-up flex flex-col items-center gap-6">
        <CatMascot variant="default" size="sm" />
        <div className="flex flex-col items-center gap-2">
          <GameTitle className="text-2xl md:text-3xl">Host Setup</GameTitle>
          <GameSubtitle>Connect Spotify and open your room lobby</GameSubtitle>
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

            <p className="text-xs text-muted-foreground">
              Playlist packs and songs-per-game are configured in the lobby and synced to players before each game.
            </p>

            <div className="flex gap-3 pt-2">
              <Button type="submit" size="lg" className="h-12 flex-1">
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
