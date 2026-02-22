import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/host-lobby";
import { Link, useFetcher, useNavigate } from "react-router";
import { Check, CheckCheck, Copy, Music2, Play, Shield, Users, Wifi } from "lucide-react";

import { CatMascot, GameCard, GameLayout, GameSubtitle, GameTitle } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  generateUserPlaylistPackFromPlaylist,
  loadHostPlaylistCatalog,
  removeUserPlaylistBySelectionId,
} from "~/lib/admin-battery.server";
import {
  clampGameSongCount,
  defaultGameSongCount,
  gameSongCountPresets,
  parseGameSongCount,
} from "~/lib/game-settings";
import { useRoomState } from "~/lib/game-engine";
import {
  readStoredSpotifyToken,
  resolveSpotifyAccessToken,
  spotifyTokenKey,
} from "~/lib/spotify-token";
import { buildUserPlaylistSelectionId } from "~/lib/playlist-selection";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Host Lobby" }];
}

type PlaylistCatalogEntry = {
  id: string;
  playlistId: string;
  name: string;
  version: number;
  roundCount: number;
  scope: "base" | "user";
  removable: boolean;
};

type HostLobbyActionResult =
  | {
      ok: true;
      mode: "add-user-playlist";
      message: string;
      playlistSelectionId: string;
    }
  | {
      ok: true;
      mode: "remove-user-playlist";
      message: string;
      playlistSelectionId: string;
    }
  | {
      ok: false;
      message: string;
    };

function jsonResponse(payload: HostLobbyActionResult, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const catalog = await loadHostPlaylistCatalog(request);

  return {
    hostSpotifyUserId: catalog.hostSpotifyUserId,
    playlistCatalog: catalog.playlists.map((entry) => ({
      id: entry.selectionId,
      playlistId: entry.playlistId,
      name: entry.name,
      version: entry.version,
      roundCount: entry.roundCount,
      scope: entry.scope,
      removable: entry.removable,
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "").trim();
  const browserSpotifyToken = String(formData.get("spotifyAccessToken") ?? "").trim();

  if (intent === "add_user_playlist") {
    const playlistPackId = String(formData.get("playlistPackId") ?? "").trim();
    const playlist = String(formData.get("playlist") ?? "").trim();

    if (!playlistPackId) {
      return jsonResponse(
        {
          ok: false,
          message: "Pack ID is required.",
        },
        400,
      );
    }
    if (!playlist) {
      return jsonResponse(
        {
          ok: false,
          message: "Spotify playlist URL or ID is required.",
        },
        400,
      );
    }

    try {
      const generated = await generateUserPlaylistPackFromPlaylist(
        playlistPackId,
        playlist,
        request,
        browserSpotifyToken || undefined,
      );
      return jsonResponse({
        ok: true,
        mode: "add-user-playlist",
        message: `Imported "${generated.playlistName}" as ${generated.playlistId} (v${generated.version}).`,
        playlistSelectionId: buildUserPlaylistSelectionId(
          generated.hostSpotifyUserId,
          generated.playlistId,
          generated.version,
        ),
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Playlist import failed.",
        },
        400,
      );
    }
  }

  if (intent === "remove_user_playlist") {
    const playlistSelectionId = String(formData.get("playlistSelectionId") ?? "").trim();
    if (!playlistSelectionId) {
      return jsonResponse(
        {
          ok: false,
          message: "Playlist selection ID is required.",
        },
        400,
      );
    }

    try {
      const removed = await removeUserPlaylistBySelectionId(
        playlistSelectionId,
        request,
        browserSpotifyToken || undefined,
      );
      return jsonResponse({
        ok: true,
        mode: "remove-user-playlist",
        message: `Removed "${removed.playlistId}" (${removed.removedFiles} file${removed.removedFiles === 1 ? "" : "s"}).`,
        playlistSelectionId,
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Playlist removal failed.",
        },
        400,
      );
    }
  }

  return jsonResponse(
    {
      ok: false,
      message: "Unknown action.",
    },
    400,
  );
}

export default function HostLobby({ params, loaderData }: Route.ComponentProps) {
  const roomId = params.roomId;
  const navigate = useNavigate();
  const playlistMutation = useFetcher<HostLobbyActionResult>();
  const room = useRoomState(roomId, "host");
  const finishedResetAppliedRef = useRef(false);
  const handledRemovalRef = useRef("");

  const [spotifyTokenPresent, setSpotifyTokenPresent] = useState(false);
  const [spotifyTokenStatus, setSpotifyTokenStatus] = useState("");
  const [browserSpotifyToken, setBrowserSpotifyToken] = useState("");
  const [copied, setCopied] = useState(false);

  const [playlistCatalog, setPlaylistCatalog] = useState<PlaylistCatalogEntry[]>(loaderData.playlistCatalog);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [requestedSongCount, setRequestedSongCount] = useState(defaultGameSongCount);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const mutationPending = playlistMutation.state !== "idle";
  const mutationResult = playlistMutation.data ?? null;

  const readinessRows = useMemo(
    () =>
      room.state.participants.map((player) => {
        const readiness = room.state.preloadReadiness[player.id];
        const ready = Boolean(readiness?.gamePackLoaded) && Boolean(readiness?.autocompleteLoaded);

        return {
          player,
          ready,
        };
      }),
    [room.state.participants, room.state.preloadReadiness],
  );
  const readyCount = readinessRows.filter((entry) => entry.ready).length;
  const allReady = readinessRows.length > 0 && readyCount === readinessRows.length;

  useEffect(() => {
    if (room.state.lifecycle !== "running") {
      return;
    }

    navigate(`/host/game/${roomId}`, { replace: true });
  }, [navigate, room.state.lifecycle, roomId]);

  useEffect(() => {
    if (room.state.lifecycle === "finished") {
      if (finishedResetAppliedRef.current) {
        return;
      }

      finishedResetAppliedRef.current = true;
      setSettingsDirty(false);
      room.controls.applyLobbySetup({
        playlistIds: room.state.playlistIds,
        songCount: room.state.gameSongCount,
      });
      return;
    }

    finishedResetAppliedRef.current = false;
  }, [
    room.controls,
    room.state.gameSongCount,
    room.state.lifecycle,
    room.state.playlistIds,
  ]);

  useEffect(() => {
    setPlaylistCatalog(loaderData.playlistCatalog);
  }, [loaderData.playlistCatalog]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setBrowserSpotifyToken(window.localStorage.getItem(spotifyTokenKey) ?? "");
  }, []);

  useEffect(() => {
    if (settingsDirty) {
      return;
    }

    setSelectedPlaylistIds((current) => {
      const next =
        room.state.playlistIds.length > 0
          ? room.state.playlistIds
          : playlistCatalog.length > 0
            ? [playlistCatalog[0]!.id]
            : [];
      return current.join(",") === next.join(",") ? current : next;
    });
    setRequestedSongCount((current) => (current === room.state.gameSongCount ? current : room.state.gameSongCount));
  }, [playlistCatalog, room.state.gameSongCount, room.state.playlistIds, settingsDirty]);

  const playlistEntries = useMemo<PlaylistCatalogEntry[]>(() => {
    const baseEntries = playlistCatalog;
    const knownIds = new Set(baseEntries.map((entry) => entry.id));
    const missingSelected = selectedPlaylistIds
      .filter((playlistId) => !knownIds.has(playlistId))
      .map((playlistId) => ({
        id: playlistId,
        playlistId,
        name: playlistId,
        version: 1,
        roundCount: defaultGameSongCount,
        scope: "base" as const,
        removable: false,
      }));

    return [...baseEntries, ...missingSelected];
  }, [playlistCatalog, selectedPlaylistIds]);

  const userPlaylistEntries = useMemo(
    () => playlistEntries.filter((entry) => entry.scope === "user" && entry.removable),
    [playlistEntries],
  );

  const normalizedSelectedPlaylistIds = useMemo(() => {
    const sanitized = [...new Set(selectedPlaylistIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    if (sanitized.length > 0) {
      return sanitized;
    }

    if (playlistEntries.length > 0) {
      return [playlistEntries[0]!.id];
    }

    return [];
  }, [playlistEntries, selectedPlaylistIds]);

  const selectedRoundCapacity = useMemo(() => {
    const roundCountByPlaylistId = new Map(playlistEntries.map((entry) => [entry.id, entry.roundCount] as const));
    const selectedTotal = normalizedSelectedPlaylistIds.reduce(
      (total, playlistId) => total + (roundCountByPlaylistId.get(playlistId) ?? 0),
      0,
    );

    return selectedTotal > 0 ? selectedTotal : defaultGameSongCount;
  }, [normalizedSelectedPlaylistIds, playlistEntries]);

  useEffect(() => {
    setRequestedSongCount((current) => clampGameSongCount(current, selectedRoundCapacity, defaultGameSongCount));
  }, [selectedRoundCapacity]);

  const selectedGameSongCount = useMemo(
    () => clampGameSongCount(requestedSongCount, selectedRoundCapacity, defaultGameSongCount),
    [requestedSongCount, selectedRoundCapacity],
  );

  const setupChanged =
    normalizedSelectedPlaylistIds.join(",") !== room.state.playlistIds.join(",") ||
    selectedGameSongCount !== room.state.gameSongCount;
  const canApplySetup = room.state.lifecycle !== "running" && (room.state.lifecycle !== "lobby" || setupChanged);
  const canStartNormally =
    room.state.lifecycle === "lobby" && !setupChanged && (room.state.participants.length === 0 || allReady);
  const canForceStart =
    room.state.lifecycle === "lobby" &&
    !setupChanged &&
    room.state.participants.length > 0 &&
    !allReady;

  const playlistNameById = useMemo(
    () => new Map(playlistEntries.map((entry) => [entry.id, entry.name] as const)),
    [playlistEntries],
  );
  const activePlaylistText = room.state.playlistIds
    .map((playlistId) => playlistNameById.get(playlistId) ?? playlistId)
    .join(" + ");

  const applySetup = () => {
    setSettingsDirty(false);
    room.controls.applyLobbySetup({
      playlistIds: normalizedSelectedPlaylistIds,
      songCount: selectedGameSongCount,
    });
  };

  const checkTokenStatus = async () => {
    const stored = readStoredSpotifyToken();
    setSpotifyTokenPresent(Boolean(stored.accessToken));
    if (stored.accessToken) {
      setBrowserSpotifyToken(stored.accessToken);
    }

    try {
      const resolved = await resolveSpotifyAccessToken();
      setSpotifyTokenPresent(true);
      setBrowserSpotifyToken(resolved.accessToken);
      if (resolved.source === "refresh") {
        setSpotifyTokenStatus("Spotify token refreshed.");
      } else if (!stored.accessToken) {
        setSpotifyTokenStatus("Spotify token ready.");
      }
    } catch {
      const fallback = readStoredSpotifyToken();
      setSpotifyTokenPresent(Boolean(fallback.accessToken));
      setBrowserSpotifyToken(fallback.accessToken);
      if (!fallback.accessToken) {
        setSpotifyTokenStatus("Spotify token missing. Reconnect Spotify.");
      }
    }
  };

  useEffect(() => {
    void checkTokenStatus();
    const timer = window.setInterval(() => {
      void checkTokenStatus();
    }, 15_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!mutationResult || !mutationResult.ok || mutationResult.mode !== "remove-user-playlist") {
      return;
    }

    const removedSelectionId = mutationResult.playlistSelectionId;
    if (handledRemovalRef.current === removedSelectionId) {
      return;
    }
    handledRemovalRef.current = removedSelectionId;

    setSelectedPlaylistIds((current) => {
      if (!current.includes(removedSelectionId)) {
        return current;
      }
      const next = current.filter((playlistId) => playlistId !== removedSelectionId);
      if (next.length > 0) {
        return next;
      }
      return playlistCatalog.length > 0 ? [playlistCatalog[0]!.id] : [];
    });
    setSettingsDirty(true);
  }, [mutationResult, playlistCatalog]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <GameLayout className="mx-auto max-w-3xl">
      <div className="animate-slide-up flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="warning">Host</Badge>
          <GameTitle className="text-2xl md:text-3xl">Game Lobby</GameTitle>
          <GameSubtitle>
            {activePlaylistText || "No playlists selected"} - {room.state.gameSongCount} songs
          </GameSubtitle>
        </div>

        <GameCard className="w-full max-w-sm p-6 text-center" glow>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Room Code</p>
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono text-5xl font-bold tracking-[0.25em] text-[hsl(var(--primary))]">{roomId}</span>
            <button
              type="button"
              onClick={copyCode}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-card-foreground"
              aria-label="Copy room code"
            >
              {copied ? <CheckCheck className="h-5 w-5 text-[hsl(155_65%_40%)]" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Share this with your players</p>
        </GameCard>

        <GameCard className="w-full p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music2 className="h-4 w-4 text-[hsl(var(--accent))]" />
              <h3 className="font-bold text-card-foreground">Game Setup</h3>
            </div>
            <Badge variant={setupChanged ? "warning" : "success"}>{setupChanged ? "Changes not synced" : "Synced"}</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-card-foreground">Playlist Packs</p>
              <div className="flex flex-col gap-2">
                {playlistEntries.map((entry) => {
                  const selected = normalizedSelectedPlaylistIds.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSettingsDirty(true);
                        setSelectedPlaylistIds((current) => {
                          if (selected) {
                            if (normalizedSelectedPlaylistIds.length <= 1) {
                              return current;
                            }
                            return current.filter((id) => id !== entry.id);
                          }

                          return [...new Set([...current, entry.id])];
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
              <p className="text-xs text-muted-foreground">Selected capacity: {selectedRoundCapacity} songs</p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-card-foreground">Songs per Game</p>
              <div className="flex flex-wrap gap-2">
                {gameSongCountPresets.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant={requestedSongCount === preset ? "default" : "outline"}
                    onClick={() => {
                      setSettingsDirty(true);
                      setRequestedSongCount(preset);
                    }}
                    disabled={preset > selectedRoundCapacity}
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
                    setSettingsDirty(true);
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
          </div>

          <div className="mt-5 grid gap-4 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-card-foreground">Import Spotify Playlist</p>
              <playlistMutation.Form method="post" className="grid gap-3">
                <input type="hidden" name="intent" value="add_user_playlist" />
                <input type="hidden" name="spotifyAccessToken" value={browserSpotifyToken} />
                <label className="grid gap-1 text-xs font-semibold text-card-foreground">
                  Pack ID
                  <Input
                    name="playlistPackId"
                    placeholder="e.g. my-party-mix"
                    required
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-card-foreground">
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
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!loaderData.hostSpotifyUserId || mutationPending}
                >
                  Import to My Playlists
                </Button>
              </playlistMutation.Form>
              {!loaderData.hostSpotifyUserId ? (
                <p className="text-xs text-muted-foreground">
                  Connect Spotify in host setup first to import playlists tied to your Spotify user ID.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Connected Spotify user: <code>{loaderData.hostSpotifyUserId}</code>
                </p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-card-foreground">My Imported Playlists</p>
              {userPlaylistEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No user playlists imported yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {userPlaylistEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-card-foreground">{entry.name}</p>
                        <p className="text-[11px] text-muted-foreground">{entry.playlistId} ({entry.roundCount} songs)</p>
                      </div>
                      <playlistMutation.Form method="post">
                        <input type="hidden" name="intent" value="remove_user_playlist" />
                        <input type="hidden" name="playlistSelectionId" value={entry.id} />
                        <input type="hidden" name="spotifyAccessToken" value={browserSpotifyToken} />
                        <Button type="submit" variant="outline" size="sm" disabled={mutationPending}>
                          Remove
                        </Button>
                      </playlistMutation.Form>
                    </div>
                  ))}
                </div>
              )}
              {mutationResult ? (
                <Badge variant={mutationResult.ok ? "success" : "warning"} className="w-fit">
                  {mutationResult.message}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="success"
              onClick={applySetup}
              disabled={!canApplySetup}
            >
              <Check className="h-4 w-4" />
              Sync Setup to Players
            </Button>
            <Button variant="success" onClick={room.controls.startGame} disabled={!canStartNormally}>
              <Play className="h-4 w-4" />
              Start Game
            </Button>
            {canForceStart ? (
              <Button variant="outline" onClick={room.controls.startGame}>
                Force Start
              </Button>
            ) : null}
          </div>
        </GameCard>

        <div className="grid w-full gap-4 md:grid-cols-2">
          <GameCard className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[hsl(var(--accent))]" />
                <h3 className="font-bold text-card-foreground">Players</h3>
              </div>
              <Badge variant={allReady ? "success" : "default"}>
                {readyCount}/{readinessRows.length} ready
              </Badge>
            </div>
            <div className="stagger-children flex flex-col gap-2">
              {readinessRows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <CatMascot variant="thinking" size="sm" />
                  <p className="text-center text-sm text-muted-foreground">Waiting for players to join...</p>
                </div>
              ) : (
                readinessRows.map((entry) => (
                  <div
                    key={entry.player.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      entry.ready ? "border-[hsl(155_65%_40%/0.25)] bg-[hsl(155_65%_40%/0.08)]" : "border-border bg-muted/40"
                    }`}
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: entry.player.color }}
                    >
                      {entry.player.name.charAt(0)}
                    </div>
                    <span className="flex-1 text-sm font-semibold text-card-foreground">{entry.player.name}</span>
                    <Badge variant={entry.ready ? "success" : "default"} className="text-[10px]">
                      {entry.ready ? "Ready" : "Loading..."}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </GameCard>

          <GameCard className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[hsl(var(--accent))]" />
              <h3 className="font-bold text-card-foreground">System Status</h3>
            </div>
            <div className="flex flex-col gap-3">
              <StatusItem
                label="Spotify Token"
                detail={spotifyTokenPresent ? "Host token active" : "Reconnect required"}
                status={spotifyTokenPresent ? "ready" : "waiting"}
              />
              <StatusItem
                label="Game Setup"
                detail={setupChanged ? "Changes waiting for sync" : `${room.state.gameSongCount} songs synced`}
                status={setupChanged ? "waiting" : "ready"}
              />
              <StatusItem
                label="Player Sync"
                detail={allReady ? "All synced" : "Waiting for players"}
                status={allReady ? "ready" : "waiting"}
              />
              {spotifyTokenStatus ? <p className="text-xs text-muted-foreground">{spotifyTokenStatus}</p> : null}
            </div>
          </GameCard>
        </div>

        {room.state.lifecycle !== "lobby" ? (
          <p className="text-center text-xs font-semibold text-[#8d2e2a]">
            Sync setup to reset the room for the next game.
          </p>
        ) : setupChanged ? (
          <p className="text-center text-xs font-semibold text-[#8d2e2a]">
            Setup changed. Sync setup to players before starting.
          </p>
        ) : !canStartNormally ? (
          <p className="text-center text-xs font-semibold text-[#8d2e2a]">
            Waiting for preload completion. Use Force Start to override.
          </p>
        ) : null}

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link to="/host/setup">Back To Setup</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Home</Link>
          </Button>
        </div>
      </div>
    </GameLayout>
  );
}

function StatusItem({
  label,
  detail,
  status,
}: {
  label: string;
  detail: string;
  status: "ready" | "waiting" | "error";
}) {
  const dotClass =
    status === "ready"
      ? "bg-[hsl(155_65%_40%)]"
      : status === "error"
        ? "bg-[hsl(var(--destructive))]"
        : "bg-[hsl(45_95%_52%)]";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="relative">
        <Wifi className="h-4 w-4 text-muted-foreground" />
        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${dotClass}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-card-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
