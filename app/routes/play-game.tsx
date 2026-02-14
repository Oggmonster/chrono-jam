import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Route } from "./+types/play-game";
import { Link } from "react-router";
import { ArrowDown, ArrowUp, CheckCircle2, Home, Minus, XCircle } from "lucide-react";

import { CatMascot, Equalizer, GameLayout, TimerBar } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { searchAutocomplete, type AutocompleteItem } from "~/lib/autocomplete";
import { phaseDurations, phaseLabel, useRoomState } from "~/lib/game-engine";
import {
  getCachedCatalogAutocompletePack,
  loadCatalogAutocompletePack,
  loadGamePack,
  type CatalogAutocompletePack,
} from "~/lib/gamepack";
import { pickMusicQuote } from "~/lib/music-quotes";
import { usePlayerPresence } from "~/lib/player-presence";
import { getPlayerSession, type PlayerSession } from "~/lib/player-session";
import {
  buildTimelineEntries,
  clampTimelineInsertIndex,
  timelineEntryLabel,
  timelineSlotLabel,
} from "~/lib/timeline";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Player Game" }];
}

function phaseInstruction(phase: string) {
  switch (phase) {
    case "LISTEN":
      return "Listen and lock your guess quickly for higher points.";
    case "REVEAL":
      return "Review the correct answer and point awards.";
    case "INTERMISSION":
      return "Next round is about to start.";
    default:
      return "Get ready for the next round.";
  }
}

export default function PlayGame({ params }: Route.ComponentProps) {
  const roomId = params.roomId;
  const room = useRoomState(roomId, "player");
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(null);
  usePlayerPresence(playerSession, room.controls);
  const [autocomplete, setAutocomplete] = useState<CatalogAutocompletePack>(() => {
    const cached = getCachedCatalogAutocompletePack();
    return (
      cached ?? {
        tracks: { items: [], prefixIndex: {} },
        artists: { items: [], prefixIndex: {} },
      }
    );
  });
  const playlistKey = useMemo(() => room.state.playlistIds.join(","), [room.state.playlistIds]);
  const playlistIdsForLoad = useMemo(
    () =>
      playlistKey
        .split(",")
        .map((playlistId) => playlistId.trim())
        .filter((playlistId) => playlistId.length > 0),
    [playlistKey],
  );
  const trackLookup = useMemo<Record<string, AutocompleteItem>>(
    () =>
      Object.fromEntries(autocomplete.tracks.items.map((item) => [item.id, item] as const)) as Record<
        string,
        AutocompleteItem
      >,
    [autocomplete.tracks.items],
  );
  const artistLookup = useMemo<Record<string, AutocompleteItem>>(
    () =>
      Object.fromEntries(autocomplete.artists.items.map((item) => [item.id, item] as const)) as Record<
        string,
        AutocompleteItem
      >,
    [autocomplete.artists.items],
  );

  const [trackQuery, setTrackQuery] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<AutocompleteItem | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<AutocompleteItem | null>(null);
  const [trackInputFocused, setTrackInputFocused] = useState(false);
  const [artistInputFocused, setArtistInputFocused] = useState(false);
  const [timelineDragging, setTimelineDragging] = useState(false);
  const [timelineHoverSlot, setTimelineHoverSlot] = useState<number | null>(null);
  const timelineListRef = useRef<HTMLDivElement | null>(null);
  const revealCardRef = useRef<HTMLDivElement | null>(null);
  const preIntermissionRankingRef = useRef<Map<string, number>>(new Map());
  const [intermissionMovementByPlayerId, setIntermissionMovementByPlayerId] = useState<Record<string, number>>({});
  const [intermissionRevealReady, setIntermissionRevealReady] = useState(false);
  const [finalRevealReady, setFinalRevealReady] = useState(false);

  const progress = useMemo(() => {
    if (room.state.lifecycle !== "running") {
      return 0;
    }

    const total = phaseDurations[room.state.phase];
    const elapsed = total - room.remainingMs;

    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  }, [room.remainingMs, room.state.lifecycle, room.state.phase]);

  const submissionKey = playerSession ? `${playerSession.id}:${room.round.id}` : "";
  const timelineSubmissionKey = playerSession ? `${playerSession.id}:${room.round.id}` : "";
  const currentSubmission = submissionKey ? room.state.guessSubmissions[submissionKey] : undefined;
  const currentTimelineSubmission = timelineSubmissionKey ? room.state.timelineSubmissions[timelineSubmissionKey] : undefined;
  const playerEligible = playerSession ? room.state.allowedPlayerIds.includes(playerSession.id) : false;
  const canEditGuess = room.state.lifecycle === "running" && room.state.phase === "LISTEN" && !currentSubmission;
  const canSubmitGuess = canEditGuess && playerEligible && Boolean(selectedTrack) && Boolean(selectedArtist);
  const canSubmitTimeline =
    room.state.lifecycle === "running" &&
    room.state.phase === "LISTEN" &&
    playerEligible &&
    Boolean(currentSubmission);
  const revealOpen = room.state.phase === "REVEAL" || room.state.lifecycle === "finished";
  const intermissionOpen = room.state.phase === "INTERMISSION";
  const finishedGame = room.state.lifecycle === "finished";
  const intermissionRoundNumber = room.state.roundIndex + 1;
  const showIntermissionStandings = intermissionOpen && intermissionRoundNumber % 3 === 0;
  const intermissionQuote = useMemo(
    () => pickMusicQuote(`${roomId}:${room.state.phaseStartedAt}:${intermissionRoundNumber}`),
    [intermissionRoundNumber, room.state.phaseStartedAt, roomId],
  );
  const leaderboard = useMemo(
    () =>
      [...room.state.participants]
        .map((participant) => ({
          ...participant,
          score: room.state.scores[participant.id] ?? 0,
        }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    [room.state.participants, room.state.scores],
  );

  const timelineEntries = useMemo(
    () => buildTimelineEntries(room.state.timelineRoundIds, room.state.rounds),
    [room.state.rounds, room.state.timelineRoundIds],
  );

  const trackSuggestions = useMemo(() => {
    if (!canEditGuess || !trackInputFocused || selectedTrack) {
      return [];
    }
    return searchAutocomplete(autocomplete.tracks, trackQuery, 8);
  }, [autocomplete.tracks, canEditGuess, selectedTrack, trackInputFocused, trackQuery]);

  const artistSuggestions = useMemo(() => {
    if (!canEditGuess || !artistInputFocused || selectedArtist) {
      return [];
    }
    return searchAutocomplete(autocomplete.artists, artistQuery, 8);
  }, [artistInputFocused, artistQuery, autocomplete.artists, canEditGuess, selectedArtist]);

  useEffect(() => {
    setPlayerSession(getPlayerSession(roomId));
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;

    const hydrateAutocomplete = async () => {
      const cached = getCachedCatalogAutocompletePack();
      if (cached) {
        setAutocomplete(cached);
        return;
      }

      try {
        const loadedPack = await loadGamePack(roomId, playlistIdsForLoad);
        if (cancelled) {
          return;
        }

        const loadedAutocomplete = await loadCatalogAutocompletePack(loadedPack.pack.meta.hash);
        if (!cancelled) {
          setAutocomplete(loadedAutocomplete);
        }
      } catch {
        // Keep empty suggestions if catalog loading fails.
      }
    };

    void hydrateAutocomplete();

    return () => {
      cancelled = true;
    };
  }, [playlistIdsForLoad, roomId]);

  useEffect(() => {
    setTrackQuery("");
    setArtistQuery("");
    setSelectedTrack(null);
    setSelectedArtist(null);
    setTrackInputFocused(false);
    setArtistInputFocused(false);
    setTimelineDragging(false);
    setTimelineHoverSlot(null);
  }, [room.round.id]);

  useEffect(() => {
    if (room.state.phase !== "INTERMISSION") {
      return;
    }

    setTrackQuery("");
    setArtistQuery("");
    setSelectedTrack(null);
    setSelectedArtist(null);
    setTrackInputFocused(false);
    setArtistInputFocused(false);
    setTimelineDragging(false);
    setTimelineHoverSlot(null);
  }, [room.state.phase]);

  useEffect(() => {
    if (room.state.phase === "INTERMISSION") {
      return;
    }

    if (!currentSubmission) {
      return;
    }

    const nextTrack = trackLookup[currentSubmission.trackId];
    const nextArtist = artistLookup[currentSubmission.artistId];

    if (nextTrack) {
      setSelectedTrack(nextTrack);
      setTrackQuery(nextTrack.display);
    }
    if (nextArtist) {
      setSelectedArtist(nextArtist);
      setArtistQuery(nextArtist.display);
    }
  }, [artistLookup, currentSubmission, room.state.phase, trackLookup]);

  useEffect(() => {
    if (!revealOpen || intermissionOpen) {
      return;
    }

    revealCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [intermissionOpen, revealOpen, room.round.id]);

  useEffect(() => {
    if (room.state.phase === "INTERMISSION") {
      return;
    }

    preIntermissionRankingRef.current = new Map(
      leaderboard.map((entry, index) => [entry.id, index] as const),
    );
  }, [leaderboard, room.state.phase]);

  useEffect(() => {
    if (room.state.phase !== "INTERMISSION") {
      setIntermissionMovementByPlayerId({});
      setIntermissionRevealReady(false);
      return;
    }
    if (!showIntermissionStandings) {
      setIntermissionMovementByPlayerId({});
      setIntermissionRevealReady(false);
      return;
    }

    const previousRanking = preIntermissionRankingRef.current;
    const nextMovement = Object.fromEntries(
      leaderboard.map((entry, index) => {
        const previousIndex = previousRanking.get(entry.id);
        return [entry.id, typeof previousIndex === "number" ? previousIndex - index : 0] as const;
      }),
    ) as Record<string, number>;

    setIntermissionMovementByPlayerId(nextMovement);
    setIntermissionRevealReady(false);
    const timer = window.setTimeout(() => {
      setIntermissionRevealReady(true);
    }, 40);

    return () => {
      window.clearTimeout(timer);
    };
  }, [leaderboard, room.state.phase, room.state.phaseStartedAt, showIntermissionStandings]);

  useEffect(() => {
    if (!finishedGame) {
      setFinalRevealReady(false);
      return;
    }

    setFinalRevealReady(false);
    const timer = window.setTimeout(() => {
      setFinalRevealReady(true);
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, [finishedGame]);

  const submitGuess = () => {
    if (!playerSession || !canSubmitGuess || !selectedTrack || !selectedArtist) {
      return;
    }

    room.controls.submitGuess({
      playerId: playerSession.id,
      roundId: room.round.id,
      trackId: selectedTrack.id,
      artistId: selectedArtist.id,
    });
  };

  const submitTimeline = (insertIndex: number) => {
    if (!playerSession || !canSubmitTimeline) {
      return;
    }

    room.controls.submitTimeline({
      playerId: playerSession.id,
      roundId: room.round.id,
      insertIndex,
    });
  };

  const handleTimelineDrop = (insertIndex: number) => {
    submitTimeline(insertIndex);
    setTimelineDragging(false);
    setTimelineHoverSlot(null);
  };

  const resolveTimelineInsertIndex = (clientY: number) => {
    const entryNodes = timelineListRef.current?.querySelectorAll<HTMLElement>("[data-timeline-entry='true']");

    if (!entryNodes || entryNodes.length === 0) {
      return 0;
    }

    for (let index = 0; index < entryNodes.length; index += 1) {
      const rect = entryNodes[index]!.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return index;
      }
    }

    return entryNodes.length;
  };

  const handleTimelineItemDragOver = (event: DragEvent<HTMLDivElement>, itemIndex: number) => {
    if (!canSubmitTimeline) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const insertIndex = event.clientY < rect.top + rect.height / 2 ? itemIndex : itemIndex + 1;
    setTimelineHoverSlot(insertIndex);
  };

  useEffect(() => {
    if (!timelineDragging || !canSubmitTimeline) {
      return;
    }

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        return;
      }

      event.preventDefault();
      const insertIndex = resolveTimelineInsertIndex(event.touches[0]!.clientY);
      setTimelineHoverSlot(insertIndex);
    };

    const onTouchEnd = (event: TouchEvent) => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      const insertIndex = touch
        ? resolveTimelineInsertIndex(touch.clientY)
        : timelineHoverSlot ?? timelineEntries.length;
      handleTimelineDrop(insertIndex);
    };

    const onTouchCancel = () => {
      setTimelineDragging(false);
      setTimelineHoverSlot(null);
    };

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: false });
    window.addEventListener("touchcancel", onTouchCancel);

    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [canSubmitTimeline, timelineDragging, timelineEntries.length, timelineHoverSlot]);

  const trackCorrect = currentSubmission?.trackId === room.round.trackId;
  const artistCorrect = currentSubmission?.artistId === room.round.artistId;
  const guessPending = room.state.phase === "LISTEN" && !currentSubmission;
  const timelinePending = room.state.phase === "LISTEN" && Boolean(currentSubmission) && !currentTimelineSubmission;
  const timelinePlaced = room.state.phase === "LISTEN" && Boolean(currentSubmission) && Boolean(currentTimelineSubmission);
  const displayedTrackQuery = intermissionOpen ? "" : trackQuery;
  const displayedArtistQuery = intermissionOpen ? "" : artistQuery;
  const playerBreakdown =
    playerSession && room.state.roundBreakdowns[room.round.id]
      ? room.state.roundBreakdowns[room.round.id]!.players[playerSession.id]
      : undefined;
  const currentScore = playerSession ? room.state.scores[playerSession.id] ?? 0 : 0;
  const timelinePreviewIndex =
    timelineDragging && canSubmitTimeline ? (timelineHoverSlot ?? timelineEntries.length) : null;
  const lockedTimelineInsertIndex =
    room.state.phase === "LISTEN" && currentTimelineSubmission
      ? clampTimelineInsertIndex(currentTimelineSubmission.insertIndex, timelineEntries.length)
      : null;
  const timelineDisplayInsertIndex = timelinePreviewIndex ?? lockedTimelineInsertIndex;
  const timelinePositionLabel =
    timelineDisplayInsertIndex === null ? null : timelineSlotLabel(timelineEntries, timelineDisplayInsertIndex);

  const nudgeTimeline = (delta: number) => {
    if (!canSubmitTimeline) {
      return;
    }

    const baseIndex = timelineDisplayInsertIndex ?? timelineEntries.length;
    const nextIndex = clampTimelineInsertIndex(baseIndex + delta, timelineEntries.length);
    submitTimeline(nextIndex);
    setTimelineHoverSlot(nextIndex);
  };

  return (
    <GameLayout className="mx-auto max-w-3xl">
      <div className="animate-slide-up flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="listening">Round {room.state.roundIndex + 1}</Badge>
            <Badge variant="default">Score {currentScore}</Badge>
          </div>
          <Badge variant={room.state.phase === "LISTEN" ? "warning" : room.state.phase === "REVEAL" ? "success" : "warning"}>
            {phaseLabel(room.state.phase)}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{phaseLabel(room.state.phase)} Phase</CardTitle>
            <CardDescription>{phaseInstruction(room.state.phase)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="rounded-2xl border-2 border-[#2f4eb8] bg-[#eef4ff] p-4 text-[#1f1f55]"
              role="status"
              aria-live="polite"
            >
              {intermissionOpen ? (
                <>
                  <p className="font-[var(--font-display)] text-2xl text-[#243a84]">Intermission</p>
                  <p className="font-bold">
                    {showIntermissionStandings ? "Standings update in progress" : "Music break"}
                  </p>
                  <p className="text-sm">
                    {showIntermissionStandings
                      ? "Get ready for the next round."
                      : "Quick vibe check before the next song."}
                  </p>
                </>
              ) : revealOpen ? (
                <>
                  <p className="font-[var(--font-display)] text-2xl text-[#243a84]">{room.round.title}</p>
                  <p className="font-bold">{room.round.artist}</p>
                  <p className="text-sm">Timeline answer: {room.round.year}</p>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <CatMascot variant="thinking" size="sm" className="animate-wiggle" />
                  <div>
                    <div className="flex items-center gap-2">
                      <Equalizer />
                      <span className="text-sm font-semibold text-card-foreground">Now Listening...</span>
                    </div>
                    <p className="text-sm">Answer hidden until reveal</p>
                    <p className="text-xs">Use autocomplete to lock your guess in this phase.</p>
                  </div>
                </div>
              )}
            </div>
            {showIntermissionStandings ? (
              <div className="rounded-2xl border-2 border-[#29459c] bg-[#f4f7ff] p-3">
                <p className="text-sm font-bold text-[#243a84]">Current top list</p>
                <ol className="mt-2 space-y-2">
                  {leaderboard.map((entry, index) => {
                    const movement = intermissionMovementByPlayerId[entry.id] ?? 0;
                    const movementBadge =
                      movement > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ddffec] px-2 py-0.5 text-xs font-bold text-[#1b8a4c]">
                          <ArrowUp className="h-3.5 w-3.5" />
                          {movement}
                        </span>
                      ) : movement < 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ffe4e1] px-2 py-0.5 text-xs font-bold text-[#b24135]">
                          <ArrowDown className="h-3.5 w-3.5" />
                          {Math.abs(movement)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#edf1ff] px-2 py-0.5 text-xs font-bold text-[#4b5f9f]">
                          <Minus className="h-3.5 w-3.5" />
                          0
                        </span>
                      );

                    return (
                      <li
                        key={entry.id}
                        className={`flex items-center justify-between rounded-xl border-2 px-3 py-2 transition-all duration-500 ${
                          entry.id === playerSession?.id
                            ? "border-[#1f8f3f] bg-[#e9ffe0]"
                            : "border-[#cad8ff] bg-white"
                        } ${
                          intermissionRevealReady
                            ? "translate-y-0 opacity-100"
                            : movement > 0
                              ? "translate-y-3 opacity-0"
                              : movement < 0
                                ? "-translate-y-3 opacity-0"
                                : "opacity-0"
                        }`}
                        style={{
                          transitionDelay: `${index * 90}ms`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-[#243a84]">#{index + 1}</span>
                          <span className="text-sm font-bold text-[#223f94]">{entry.name}</span>
                          {movementBadge}
                        </div>
                        <span className="text-sm font-extrabold text-[#2d2a77]">{entry.score}</span>
                      </li>
                    );
                  })}
                  {leaderboard.length === 0 ? (
                    <li className="rounded-xl border-2 border-[#cad8ff] bg-white px-3 py-2 text-xs font-semibold text-[#5f6ea9]">
                      Waiting for players.
                    </li>
                  ) : null}
                </ol>
              </div>
            ) : null}
            {intermissionOpen && !showIntermissionStandings ? (
              <div className="rounded-2xl border-2 border-[#29459c] bg-[#f4f7ff] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#4f5fa2]">Now playing wisdom</p>
                <p className="mt-2 text-lg font-bold text-[#243a84]">"{intermissionQuote}"</p>
              </div>
            ) : null}

            <TimerBar progress={progress} seconds={Math.ceil(room.remainingMs / 1000)} />
            {revealOpen && !finishedGame ? (
              <div
                ref={revealCardRef}
                className="rounded-2xl border-2 border-[#29459c] bg-[#fff8dd] p-3"
              >
                <p className="text-sm font-bold text-[#243a84]">Round result</p>
                <div className="mt-2 space-y-2">
                  {[
                    {
                      id: "track",
                      label: "Song title",
                      correct: Boolean(trackCorrect),
                      points: playerBreakdown?.points.track ?? 0,
                    },
                    {
                      id: "artist",
                      label: "Artist",
                      correct: Boolean(artistCorrect),
                      points: playerBreakdown?.points.artist ?? 0,
                    },
                    {
                      id: "timeline",
                      label: "Timeline",
                      correct: Boolean(playerBreakdown?.timelineCorrect),
                      points: playerBreakdown?.points.timeline ?? 0,
                    },
                  ].map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg border border-[#d4c47f] bg-white/70 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm font-bold text-[#243a84]">
                        {entry.correct ? (
                          <CheckCircle2 className="h-4 w-4 text-[#1f8f3f]" />
                        ) : (
                          <XCircle className="h-4 w-4 text-[#b24135]" />
                        )}
                        {entry.label}
                      </span>
                      <span className="text-sm font-extrabold text-[#2d2a77]">
                        {entry.correct ? `+${entry.points}` : "0"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {revealOpen && !finishedGame ? (
              <div className="rounded-2xl border-2 border-[#2f4eb8] bg-[#eef4ff] p-3">
                <p className="text-sm font-bold text-[#223f94]">Your scoring</p>
                {playerBreakdown ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#1f1f55]">
                    <Badge variant="success">Round +{playerBreakdown.points.total}</Badge>
                    <Badge variant="default">Total {currentScore}</Badge>
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-[#4f5fa2]">
                    No points awarded this round.
                  </p>
                )}
              </div>
            ) : null}

            {finishedGame ? (
              <div className="rounded-2xl border-2 border-[#29459c] bg-[#f8f3ff] p-3">
                <p className="text-sm font-bold text-[#243a84]">Final standings</p>
                <p className="text-xs font-semibold text-[#4f5fa2]">
                  Revealing from the bottom to the top.
                </p>
                <ol className="mt-3 space-y-2">
                  {leaderboard.map((entry, index) => (
                    <li
                      key={entry.id}
                      className={`flex items-center justify-between rounded-xl border-2 px-3 py-2 transition-all duration-500 ${
                        entry.id === playerSession?.id
                          ? "border-[#1f8f3f] bg-[#e9ffe0]"
                          : "border-[#cab8ff] bg-white"
                      } ${
                        finalRevealReady ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                      }`}
                      style={{
                        transitionDelay: `${(leaderboard.length - 1 - index) * 140}ms`,
                      }}
                    >
                      <span className="text-sm font-extrabold text-[#243a84]">
                        #{index + 1} {entry.name}
                      </span>
                      <span className="text-sm font-extrabold text-[#2d2a77]">{entry.score}</span>
                    </li>
                  ))}
                  {leaderboard.length === 0 ? (
                    <li className="rounded-xl border-2 border-[#cab8ff] bg-white px-3 py-2 text-xs font-semibold text-[#5f6ea9]">
                      No players to rank.
                    </li>
                  ) : null}
                </ol>
              </div>
            ) : null}

            {!intermissionOpen && !finishedGame ? (
              <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2 text-sm font-bold text-[#32277e]">
                <label htmlFor="track-guess-input">Song title</label>
                <Input
                  id="track-guess-input"
                  placeholder="Type at least 2 chars"
                  value={displayedTrackQuery}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setTrackQuery(nextValue);
                    setSelectedTrack(null);
                  }}
                  onFocus={() => {
                    setTrackInputFocused(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setTrackInputFocused(false);
                    }, 120);
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="search"
                  aria-autocomplete="list"
                  aria-controls="track-guess-listbox"
                  aria-expanded={
                    canEditGuess && trackInputFocused && !selectedTrack && trackQuery.trim().length >= 2
                  }
                  disabled={!canEditGuess}
                />
                {selectedTrack && !intermissionOpen ? (
                  <span className="text-xs font-semibold text-[#22438f]">Selected: {selectedTrack.display}</span>
                ) : null}
                {canEditGuess && trackInputFocused && !selectedTrack && trackQuery.trim().length >= 2 ? (
                  <ul
                    id="track-guess-listbox"
                    role="listbox"
                    className="max-h-40 overflow-y-auto rounded-xl border-2 border-[#2f4eb8] bg-white/90"
                  >
                    {trackSuggestions.map((suggestion) => (
                      <li key={suggestion.id} className="border-b border-[#cad8ff] last:border-b-0">
                        <button
                          type="button"
                          role="option"
                          className="w-full px-3 py-2 text-left text-sm font-semibold text-[#223f94] hover:bg-[#eef4ff]"
                          onPointerDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            setSelectedTrack(suggestion);
                            setTrackQuery(suggestion.display);
                            setTrackInputFocused(false);
                          }}
                        >
                          {suggestion.display}
                        </button>
                      </li>
                    ))}
                    {trackSuggestions.length === 0 ? (
                      <li className="px-3 py-2 text-xs font-semibold text-[#6558a8]">No matches found.</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
              <div className="grid gap-2 text-sm font-bold text-[#32277e]">
                <label htmlFor="artist-guess-input">Artist</label>
                <Input
                  id="artist-guess-input"
                  placeholder="Type at least 2 chars"
                  value={displayedArtistQuery}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setArtistQuery(nextValue);
                    setSelectedArtist(null);
                  }}
                  onFocus={() => {
                    setArtistInputFocused(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setArtistInputFocused(false);
                    }, 120);
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="search"
                  aria-autocomplete="list"
                  aria-controls="artist-guess-listbox"
                  aria-expanded={
                    canEditGuess && artistInputFocused && !selectedArtist && artistQuery.trim().length >= 2
                  }
                  disabled={!canEditGuess}
                />
                {selectedArtist && !intermissionOpen ? (
                  <span className="text-xs font-semibold text-[#22438f]">Selected: {selectedArtist.display}</span>
                ) : null}
                {canEditGuess && artistInputFocused && !selectedArtist && artistQuery.trim().length >= 2 ? (
                  <ul
                    id="artist-guess-listbox"
                    role="listbox"
                    className="max-h-40 overflow-y-auto rounded-xl border-2 border-[#2f4eb8] bg-white/90"
                  >
                    {artistSuggestions.map((suggestion) => (
                      <li key={suggestion.id} className="border-b border-[#cad8ff] last:border-b-0">
                        <button
                          type="button"
                          role="option"
                          className="w-full px-3 py-2 text-left text-sm font-semibold text-[#223f94] hover:bg-[#eef4ff]"
                          onPointerDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            setSelectedArtist(suggestion);
                            setArtistQuery(suggestion.display);
                            setArtistInputFocused(false);
                          }}
                        >
                          {suggestion.display}
                        </button>
                      </li>
                    ))}
                    {artistSuggestions.length === 0 ? (
                      <li className="px-3 py-2 text-xs font-semibold text-[#6558a8]">No matches found.</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={submitGuess} disabled={!canSubmitGuess}>
                Lock Guess
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedTrack(null);
                  setTrackQuery("");
                  setTrackInputFocused(false);
                  setSelectedArtist(null);
                  setArtistQuery("");
                  setArtistInputFocused(false);
                }}
                disabled={!canEditGuess}
              >
                Clear
              </Button>
              {guessPending ? <Badge variant="warning">Waiting for your guess</Badge> : null}
              {currentSubmission ? <Badge variant="success">Guess locked</Badge> : null}
              {timelinePending ? <Badge variant="warning">Place the timeline</Badge> : null}
              {timelinePlaced ? <Badge variant="success">Timeline position saved</Badge> : null}
              {!playerSession && canEditGuess ? (
                <Badge variant="warning">Join with player name to submit</Badge>
              ) : null}
              {playerSession && canEditGuess && !playerEligible ? (
                <Badge variant="warning">Spectating only: joined after game start</Badge>
              ) : null}
            </div>

            <div className="rounded-2xl border-2 border-[#2f4eb8] bg-[#f7fbff] p-3">
              <p className="text-sm font-bold text-[#223f94]">Timeline placement</p>
              <p className="text-xs font-semibold text-[#4d5d9f]">
                {currentSubmission
                  ? "Drag the release year between items. You can keep moving it until the timer ends."
                  : "Lock your guess to unlock timeline placement."}
              </p>
              {currentSubmission ? (
                <p className="mt-1 text-xs font-semibold text-[#3f4f93]" role="status" aria-live="polite">
                  Current position: {timelinePositionLabel ?? "Not placed"}
                </p>
              ) : null}
              {canSubmitTimeline ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => nudgeTimeline(-1)}>
                    Move Earlier
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => nudgeTimeline(1)}>
                    Move Later
                  </Button>
                </div>
              ) : null}
              <div className="mt-3 rounded-xl border-2 border-dashed border-[#6a7ec2] bg-white px-3 py-2">
                <div
                  draggable={canSubmitTimeline}
                  onDragStart={() => {
                    setTimelineDragging(true);
                    setTimelineHoverSlot(
                      lockedTimelineInsertIndex ?? timelineEntries.length,
                    );
                  }}
                  onDragEnd={() => {
                    setTimelineDragging(false);
                    setTimelineHoverSlot(null);
                  }}
                  onTouchStart={(event) => {
                    if (!canSubmitTimeline || event.touches.length === 0) {
                      return;
                    }

                    event.preventDefault();
                    setTimelineDragging(true);
                    setTimelineHoverSlot(resolveTimelineInsertIndex(event.touches[0]!.clientY));
                  }}
                  className={`rounded-lg border-2 px-3 py-2 text-sm font-extrabold text-[#223f94] ${
                    canSubmitTimeline
                      ? "cursor-grab border-[#2f4eb8] bg-[#eaf1ff]"
                      : "border-[#c4d1f3] bg-[#f3f7ff] text-[#6a78b0]"
                  }`}
                  aria-label="Release year marker"
                >
                  Release year
                </div>
              </div>
              <div
                ref={timelineListRef}
                className="mt-3 space-y-2"
                role="list"
                aria-label="Timeline entries"
                onDragOver={(event) => {
                  if (!canSubmitTimeline) {
                    return;
                  }

                  event.preventDefault();
                  if (event.currentTarget !== event.target) {
                    return;
                  }

                  setTimelineHoverSlot(timelineEntries.length);
                }}
                onDrop={(event) => {
                  if (!canSubmitTimeline) {
                    return;
                  }

                  event.preventDefault();
                  handleTimelineDrop(timelineHoverSlot ?? timelineEntries.length);
                }}
              >
                {timelineEntries.map((entry, index) => (
                  <div key={entry.id} className="space-y-2" role="listitem">
                    {timelineDisplayInsertIndex === index ? (
                      <div
                        draggable={canSubmitTimeline && !timelineDragging}
                        onDragStart={() => {
                          if (!canSubmitTimeline) {
                            return;
                          }
                          setTimelineDragging(true);
                          setTimelineHoverSlot(index);
                        }}
                        onDragEnd={() => {
                          setTimelineDragging(false);
                          setTimelineHoverSlot(null);
                        }}
                        onTouchStart={(event) => {
                          if (!canSubmitTimeline || event.touches.length === 0) {
                            return;
                          }

                          event.preventDefault();
                          setTimelineDragging(true);
                          setTimelineHoverSlot(resolveTimelineInsertIndex(event.touches[0]!.clientY));
                        }}
                        className={`rounded-lg border-2 px-3 py-2 text-sm font-extrabold ${
                          timelineDragging
                            ? "border-dashed border-[#2f4eb8] bg-[#eaf1ff] text-[#223f94]"
                            : canSubmitTimeline
                              ? "cursor-grab border-[#1f8f3f] bg-[#dbffce] text-[#1f8f3f]"
                              : "border-[#1f8f3f] bg-[#dbffce] text-[#1f8f3f]"
                        }`}
                      >
                        Release year
                      </div>
                    ) : null}
                    <div
                      data-timeline-entry="true"
                      onDragOver={(event) => handleTimelineItemDragOver(event, index)}
                      className="rounded-lg border-2 border-[#3049a3] bg-[#f3f0ff] px-3 py-2 text-sm font-extrabold text-[#223f94]"
                    >
                      {timelineEntryLabel(entry)}
                    </div>
                  </div>
                ))}
                {timelineDisplayInsertIndex === timelineEntries.length ? (
                  <div
                    draggable={canSubmitTimeline && !timelineDragging}
                    onDragStart={() => {
                      if (!canSubmitTimeline) {
                        return;
                      }
                      setTimelineDragging(true);
                      setTimelineHoverSlot(timelineEntries.length);
                    }}
                    onDragEnd={() => {
                      setTimelineDragging(false);
                      setTimelineHoverSlot(null);
                    }}
                    onTouchStart={(event) => {
                      if (!canSubmitTimeline || event.touches.length === 0) {
                        return;
                      }

                      event.preventDefault();
                      setTimelineDragging(true);
                      setTimelineHoverSlot(resolveTimelineInsertIndex(event.touches[0]!.clientY));
                    }}
                    className={`rounded-lg border-2 px-3 py-2 text-sm font-extrabold ${
                      timelineDragging
                        ? "border-dashed border-[#2f4eb8] bg-[#eaf1ff] text-[#223f94]"
                        : canSubmitTimeline
                          ? "cursor-grab border-[#1f8f3f] bg-[#dbffce] text-[#1f8f3f]"
                          : "border-[#1f8f3f] bg-[#dbffce] text-[#1f8f3f]"
                    }`}
                  >
                    Release year
                  </div>
                ) : null}
              </div>
            </div>
              </>
            ) : null}

          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link to={`/play/lobby/${roomId}`}>Back To Lobby</Link>
          </Button>
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
