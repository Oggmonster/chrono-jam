import { useEffect, useState } from "react";
import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin";
import { Home } from "lucide-react";

import { GameCard, GameLayout, GameSubtitle, GameTitle } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { buildAdminAuthCookie, getAdminPassword, isAdminAuthenticated, isAdminPasswordConfigured } from "~/lib/admin-auth.server";
import { generatePlaylistPackFromPlaylist } from "~/lib/admin-battery.server";
import { spotifyTokenKey } from "~/lib/spotify-token";

type AdminActionResult =
  | {
      ok: true;
      mode: "login";
      message: string;
    }
  | {
      ok: true;
      mode: "generate-playlist-pack";
      message: string;
      fileName: string;
      version: number;
      playlistId: string;
      playlistName: string;
      sourcePlaylistId: string;
      sourcePlaylistName: string;
      trackCount: number;
      artistCount: number;
      roundCount: number;
    }
  | {
      ok: false;
      message: string;
    };

function jsonResponse(payload: AdminActionResult, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return {
    authenticated: isAdminAuthenticated(request),
    adminPasswordConfigured: isAdminPasswordConfigured(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "").trim();

  if (intent === "logout") {
    return redirect("/admin", {
      headers: {
        "Set-Cookie": buildAdminAuthCookie(request, false),
      },
    });
  }

  if (intent === "login") {
    if (!isAdminPasswordConfigured()) {
      return jsonResponse(
        {
          ok: false,
          message: "ADMIN_PASSWORD is not configured on the server.",
        },
        500,
      );
    }

    const submittedPassword = String(formData.get("password") ?? "");
    if (submittedPassword !== getAdminPassword()) {
      return jsonResponse(
        {
          ok: false,
          message: "Invalid password.",
        },
        401,
      );
    }

    return redirect("/admin", {
      headers: {
        "Set-Cookie": buildAdminAuthCookie(request, true),
      },
    });
  }

  if (intent === "generate_playlist_pack") {
    if (!isAdminAuthenticated(request)) {
      return jsonResponse(
        {
          ok: false,
          message: "Sign in first.",
        },
        403,
      );
    }

    const playlist = String(formData.get("playlist") ?? "").trim();
    const playlistPackId = String(formData.get("playlistPackId") ?? "").trim();
    const browserSpotifyToken = String(formData.get("spotifyAccessToken") ?? "").trim();
    if (!playlist) {
      return jsonResponse(
        {
          ok: false,
          message: "Playlist URL/ID is required.",
        },
        400,
      );
    }

    if (!playlistPackId) {
      return jsonResponse(
        {
          ok: false,
          message: "Pack ID is required.",
        },
        400,
      );
    }

    try {
      const result = await generatePlaylistPackFromPlaylist(
        playlistPackId,
        playlist,
        request,
        browserSpotifyToken || undefined,
      );
      return jsonResponse({
        ok: true,
        mode: "generate-playlist-pack",
        message: "Playlist pack generated.",
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed.";
      return jsonResponse(
        {
          ok: false,
          message,
        },
        400,
      );
    }
  }

  return jsonResponse(
    {
      ok: false,
      message: "Unknown admin action.",
    },
    400,
  );
}

export default function Admin({ loaderData, actionData }: Route.ComponentProps) {
  const result = actionData as AdminActionResult | undefined;
  const [browserToken, setBrowserToken] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setBrowserToken(window.localStorage.getItem(spotifyTokenKey) ?? "");
  }, []);

  return (
    <GameLayout className="mx-auto max-w-3xl">
      <div className="animate-slide-up flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          <GameTitle className="text-2xl md:text-3xl">Admin</GameTitle>
          <GameSubtitle>Playlist pack generation tools</GameSubtitle>
        </div>

        {!loaderData.adminPasswordConfigured ? (
          <GameCard className="p-5">
            <h3 className="text-lg font-bold text-card-foreground">Missing Admin Password</h3>
            <p className="mt-2 text-sm text-muted-foreground">
                Set <code>ADMIN_PASSWORD</code> in environment variables to enable this page.
            </p>
          </GameCard>
        ) : null}

        {loaderData.adminPasswordConfigured && !loaderData.authenticated ? (
          <GameCard className="p-5">
            <h3 className="text-lg font-bold text-card-foreground">Sign In</h3>
            <p className="mt-1 text-sm text-muted-foreground">Simple password protection for admin tools.</p>
            <div className="mt-4">
              <Form method="post" className="grid gap-4">
                <input type="hidden" name="intent" value="login" />
                <label className="grid gap-2 text-sm font-semibold text-card-foreground">
                  Admin password
                  <Input name="password" type="password" required />
                </label>
                <Button type="submit" variant="success">
                  Sign In
                </Button>
              </Form>
            </div>
          </GameCard>
        ) : null}

        {loaderData.adminPasswordConfigured && loaderData.authenticated ? (
          <GameCard className="p-5">
            <h3 className="text-lg font-bold text-card-foreground">Playlist Pack Generator</h3>
            <p className="mt-1 text-sm text-muted-foreground">
                Builds a new <code>playlists/&lt;pack-id&gt;.vN.json</code> from Spotify and updates
                <code>playlists/index.json</code>.
            </p>
            <div className="mt-4 space-y-4">
              <Form method="post" className="grid gap-4">
                <input type="hidden" name="intent" value="generate_playlist_pack" />
                <input type="hidden" name="spotifyAccessToken" value={browserToken} />
                <label className="grid gap-2 text-sm font-semibold text-card-foreground">
                  Pack ID
                  <Input
                    name="playlistPackId"
                    placeholder="e.g. disco-classics"
                    required
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-card-foreground">
                  Spotify playlist URL or ID
                  <Input
                    name="playlist"
                    placeholder="https://open.spotify.com/playlist/..."
                    required
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Host browser token: {browserToken ? "available" : "missing"}.
                </p>
                <Button type="submit" variant="success">
                  Generate New Playlist Pack Version
                </Button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="logout" />
                <Button type="submit" variant="outline">
                  Sign Out
                </Button>
              </Form>
            </div>
          </GameCard>
        ) : null}

        {result ? (
          <GameCard className="p-5">
            <h3 className="text-lg font-bold text-card-foreground">Result</h3>
            <div className="mt-3 space-y-2">
              <Badge variant={result.ok ? "success" : "warning"}>{result.ok ? "Success" : "Error"}</Badge>
              <p className="text-sm font-semibold text-card-foreground">{result.message}</p>
              {result.ok && result.mode === "generate-playlist-pack" ? (
                <div className="grid gap-1 text-xs text-muted-foreground">
                  <p>Version: {result.version}</p>
                  <p>File: {result.fileName}</p>
                  <p>Pack ID: {result.playlistId}</p>
                  <p>Source playlist: {result.sourcePlaylistName} ({result.sourcePlaylistId})</p>
                  <p>Tracks: {result.trackCount}</p>
                  <p>Artists: {result.artistCount}</p>
                  <p>Rounds: {result.roundCount}</p>
                </div>
              ) : null}
            </div>
          </GameCard>
        ) : null}

        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link to="/">
              <Home className="h-4 w-4" />
              Home
            </Link>
          </Button>
        </div>
      </div>
    </GameLayout>
  );
}
