import { useEffect, useState } from "react";
import { Form, redirect } from "react-router";
import type { Route } from "./+types/admin";

import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { buildAdminAuthCookie, getAdminPassword, isAdminAuthenticated, isAdminPasswordConfigured } from "~/lib/admin-auth.server";
import { generateBaseBatteryFromPlaylist } from "~/lib/admin-battery.server";
import { spotifyTokenKey } from "~/lib/spotify-token";

type AdminActionResult =
  | {
      ok: true;
      mode: "login";
      message: string;
    }
  | {
      ok: true;
      mode: "generate";
      message: string;
      fileName: string;
      version: number;
      playlistId: string;
      playlistName: string;
      trackCount: number;
      artistCount: number;
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

  if (intent === "generate_base_battery") {
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

    try {
      const result = await generateBaseBatteryFromPlaylist(
        playlist,
        request,
        browserSpotifyToken || undefined,
      );
      return jsonResponse({
        ok: true,
        mode: "generate",
        message: "Base battery generated.",
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
    <main className="jam-page">
      <section className="jam-stage w-full max-w-3xl">
        <Ribbon tone="cool">Admin</Ribbon>

        {!loaderData.adminPasswordConfigured ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Missing Admin Password</CardTitle>
              <CardDescription>
                Set <code>ADMIN_PASSWORD</code> in environment variables to enable this page.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {loaderData.adminPasswordConfigured && !loaderData.authenticated ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>Simple password protection for admin tools.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form method="post" className="grid gap-4">
                <input type="hidden" name="intent" value="login" />
                <label className="grid gap-2 text-sm font-bold text-[#32277e]">
                  Admin password
                  <Input name="password" type="password" required />
                </label>
                <Button type="submit" variant="success">
                  Sign In
                </Button>
              </Form>
            </CardContent>
          </Card>
        ) : null}

        {loaderData.adminPasswordConfigured && loaderData.authenticated ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Base Battery Generator</CardTitle>
              <CardDescription>
                Builds a new <code>base-battery.vN.json</code> from a Spotify playlist and updates the latest-version manifest.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Form method="post" className="grid gap-4">
                <input type="hidden" name="intent" value="generate_base_battery" />
                <input type="hidden" name="spotifyAccessToken" value={browserToken} />
                <label className="grid gap-2 text-sm font-bold text-[#32277e]">
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
                <p className="text-xs font-semibold text-[#4d5d9f]">
                  Host browser token: {browserToken ? "available" : "missing"}.
                </p>
                <Button type="submit" variant="success">
                  Generate New Base Battery Version
                </Button>
              </Form>

              <Form method="post">
                <input type="hidden" name="intent" value="logout" />
                <Button type="submit" variant="outline">
                  Sign Out
                </Button>
              </Form>
            </CardContent>
          </Card>
        ) : null}

        {result ? (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge variant={result.ok ? "success" : "warning"}>{result.ok ? "Success" : "Error"}</Badge>
              <p className="text-sm font-semibold text-[#1f1f55]">{result.message}</p>
              {result.ok && result.mode === "generate" ? (
                <div className="grid gap-1 text-xs font-semibold text-[#4d5d9f]">
                  <p>Version: {result.version}</p>
                  <p>File: {result.fileName}</p>
                  <p>Playlist: {result.playlistName} ({result.playlistId})</p>
                  <p>Tracks: {result.trackCount}</p>
                  <p>Artists: {result.artistCount}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  );
}
