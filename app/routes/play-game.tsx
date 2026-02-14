import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Route } from "./+types/play-game";
import { Link } from "react-router";
import { CheckCircle2, Crown, Home, Music, Quote, Star, TrendingUp, Trophy, XCircle } from "lucide-react";

import { CatMascot, Equalizer, GameCard, GameLayout, TimerBar } from "~/components/game/game-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
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
  const [finalRevealReady, setFinalRevealReady] = useState(false);

  const progress = useMemo(() => {
    if (room.state.lifecycle !== "running") {
      return 0;
    }

    const total = phaseDurations[room.state.phase];
    return Math.max(0, Math.min(100, Math.round((room.remainingMs / total) * 100)));
  }, [room.remainingMs, room.state.lifecycle, room.state.phase]);
  const remainingSeconds = Math.ceil(room.remainingMs / 1000);
  const timerVariant: "default" | "warning" | "danger" =
    room.state.phase !== "LISTEN"
      ? "default"
      : remainingSeconds <= 5
        ? "danger"
        : remainingSeconds <= 10
          ? "warning"
          : "default";

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

  const revealRows = [
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
  ];
  const intermissionCompactView = intermissionOpen;
  const layoutWidthClass = room.state.phase === "REVEAL" || intermissionCompactView || finishedGame ? "max-w-lg" : "max-w-3xl";
  const winnerScore = leaderboard[0]?.score ?? currentScore;

  return (
    <GameLayout className={`mx-auto ${layoutWidthClass}`}>
      <div className="animate-slide-up flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="listening">Round {room.state.roundIndex + 1}</Badge>
            <Badge variant="default">Score {currentScore}</Badge>
          </div>
          <Badge variant={finishedGame ? "danger" : room.state.phase === "LISTEN" ? "warning" : room.state.phase === "REVEAL" ? "success" : "warning"}>
            {finishedGame ? "Final" : phaseLabel(room.state.phase)}
          </Badge>
        </div>

        {finishedGame ? (
          <>
            <GameCard className="relative overflow-hidden border-[hsl(var(--primary)/0.25)] p-8 text-center">
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span
                    key={`confetti-${i}`}
                    className="absolute h-2 w-2 animate-float rounded-full"
                    style={{
                      left: `${8 + (i * 5.5) % 84}%`,
                      top: `${4 + (i * 9) % 70}%`,
                      backgroundColor: ["hsl(4 80% 62%)", "hsl(174 60% 42%)", "hsl(45 95% 52%)", "hsl(200 75% 50%)", "hsl(262 50% 58%)"][i % 5],
                      animationDelay: `${i * 0.15}s`,
                      opacity: 0.5,
                    }}
                  />
                ))}
              </div>
              <div className="relative z-10 flex flex-col items-center gap-4">
                <CatMascot variant="celebrate" size="lg" className="animate-bounce-in" />
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)]">
                  <Trophy className="h-8 w-8 text-[hsl(var(--primary))]" />
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Game Complete</p>
                  <h2 className="text-balance text-3xl font-bold text-card-foreground">Final Standings</h2>
                </div>
              </div>
            </GameCard>

            <GameCard className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[hsl(var(--primary))]" />
                <p className="text-sm font-bold text-card-foreground">Final Standings</p>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">Revealing from the bottom to the top.</p>
              <ol className="space-y-2">
                {leaderboard.map((entry, index) => {
                  const isWinner = index === 0;
                  return (
                    <li
                      key={entry.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-all duration-500 ${
                        isWinner
                          ? "border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] shadow-md shadow-[hsl(var(--primary)/0.1)]"
                          : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)]"
                      } ${finalRevealReady ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
                      style={{ transitionDelay: `${(leaderboard.length - 1 - index) * 140}ms` }}
                    >
                      <div className="flex w-8 items-center justify-center">
                        {index === 0 ? (
                          <Crown className="h-6 w-6 text-[hsl(var(--primary))]" />
                        ) : index === 1 ? (
                          <Star className="h-5 w-5 text-[hsl(45_95%_52%)]" />
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground">#{index + 1}</span>
                        )}
                      </div>
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                        isWinner
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                      }`}>
                        {entry.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 font-bold text-card-foreground">{entry.name}</span>
                      <span className={`font-mono text-xl font-bold ${isWinner ? "text-[hsl(var(--primary))]" : "text-card-foreground"}`}>
                        {entry.score.toLocaleString()}
                      </span>
                    </li>
                  );
                })}
                {leaderboard.length === 0 ? (
                  <li className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-3 py-2 text-xs font-semibold text-muted-foreground">
                    No players to rank.
                  </li>
                ) : null}
              </ol>
              <div className="mt-4 rounded-xl border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.08)] px-4 py-2">
                <p className="text-sm font-bold text-[hsl(var(--primary))]">Winning score: {winnerScore}</p>
              </div>
            </GameCard>
          </>
        ) : room.state.phase === "REVEAL" ? (
          <>
            <GameCard className="relative overflow-hidden border-accent/30 p-6">
              <div className="absolute inset-x-0 top-0 h-1 bg-[hsl(var(--accent))]" />
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                  <Music className="h-7 w-7 text-[hsl(var(--accent))]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-card-foreground">{room.round.title}</p>
                  <p className="text-base font-semibold text-muted-foreground">{room.round.artist}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Released in {room.round.year}</p>
                </div>
              </div>
            </GameCard>

            <TimerBar
              key={`${room.state.phase}:${room.state.phaseStartedAt}`}
              progress={progress}
              seconds={remainingSeconds}
              variant="default"
            />

            <GameCard className="animate-slide-up p-5">
              <div ref={revealCardRef}>
                <p className="mb-4 text-sm font-bold text-card-foreground">Round Result</p>
                <div className="stagger-children flex flex-col gap-2">
                  {revealRows.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                        entry.correct
                          ? "border-[hsl(155_65%_40%/0.25)] bg-[hsl(155_65%_40%/0.08)]"
                          : "border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.08)]"
                      }`}
                    >
                      {entry.correct ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1f8f3f]" />
                      ) : (
                        <XCircle className="h-5 w-5 shrink-0 text-[hsl(var(--destructive))]" />
                      )}
                      <span className="flex-1 text-sm font-semibold text-card-foreground">
                        {entry.label}
                      </span>
                      <span
                        className={`font-mono text-sm font-bold ${
                          entry.correct ? "text-[#1f8f3f]" : "text-[hsl(var(--destructive))]"
                        }`}
                      >
                        {entry.correct ? `+${entry.points}` : "0"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </GameCard>

            <GameCard className="animate-slide-up p-5" style={{ animationDelay: "200ms" }}>
              <p className="mb-3 text-sm font-bold text-card-foreground">Your Scoring</p>
              {playerBreakdown ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-xl border border-[hsl(155_65%_40%/0.25)] bg-[hsl(155_65%_40%/0.08)] px-4 py-2">
                    <TrendingUp className="h-4 w-4 text-[#1f8f3f]" />
                    <span className="text-sm font-bold text-[#1f8f3f]">+{playerBreakdown.points.total}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.08)] px-4 py-2">
                    <span className="text-sm font-bold text-[hsl(var(--primary))]">Total: {currentScore}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-semibold text-muted-foreground">No points awarded this round.</p>
              )}
            </GameCard>
          </>
        ) : intermissionCompactView ? (
          <Card>
            <CardContent className="space-y-6 p-8 text-center">
              <div className="flex flex-col items-center gap-6">
                <CatMascot variant="chill" size="lg" className="animate-float" />

                <div>
                  <p className="text-xl font-bold text-card-foreground">Intermission</p>
                  <p className="text-sm text-muted-foreground">Quick vibe check before the next song</p>
                </div>

                <Equalizer className="h-8" />

                <div className="flex items-center justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.05)]">
                    <span className="animate-count-pulse font-mono text-3xl font-bold text-[hsl(var(--primary))]">
                      {remainingSeconds}
                    </span>
                  </div>
                </div>

                <div className="relative max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-4">
                  <div className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]" />
                  <div className="relative">
                    <Quote className="absolute -left-0.5 -top-0.5 h-4 w-4 text-[hsl(var(--primary)/0.4)]" />
                    <p className="pl-5 text-sm italic leading-relaxed text-card-foreground">
                      {`"${intermissionQuote}"`}
                    </p>
                    <p className="mt-2 pl-5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Cat Wisdom
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-4 pt-4">
              <div
                className={
                  room.state.phase === "LISTEN"
                    ? "rounded-2xl border border-[hsl(var(--input))] bg-[hsl(var(--secondary)/0.35)] p-4 text-card-foreground"
                    : "rounded-2xl border-2 border-[#2f4eb8] bg-[#eef4ff] p-4 text-[#1f1f55]"
                }
                role="status"
                aria-live="polite"
              >
                {intermissionOpen ? (
                  <>
                    <p className="font-[var(--font-display)] text-2xl text-[#243a84]">Intermission</p>
                    <p className="font-bold">Music break</p>
                    <p className="text-sm">
                      Quick vibe check before the next song.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <CatMascot variant="thinking" size="sm" className="animate-wiggle" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Equalizer />
                        <span className="text-sm font-semibold text-card-foreground">Now Listening...</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Answer hidden until reveal</p>
                      <p className="text-xs text-muted-foreground">Use autocomplete to lock your guess in this phase.</p>
                    </div>
                  </div>
                )}
              </div>
            <TimerBar
              key={`${room.state.phase}:${room.state.phaseStartedAt}`}
              progress={progress}
              seconds={remainingSeconds}
              variant={timerVariant}
            />

            {room.state.phase === "LISTEN" ? (
              <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2 text-sm font-bold text-card-foreground">
                <label htmlFor="track-guess-input">Song title</label>
                <div className="relative z-20">
                  <Input
                    id="track-guess-input"
                    placeholder="Type at least 2 chars"
                    className="h-11 border-[hsl(var(--input))] bg-[hsl(var(--muted)/0.35)] text-card-foreground placeholder:text-muted-foreground"
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
                  {canEditGuess && trackInputFocused && !selectedTrack && trackQuery.trim().length >= 2 ? (
                    <ul
                      id="track-guess-listbox"
                      role="listbox"
                      className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 max-h-40 overflow-y-auto rounded-xl border border-[hsl(var(--input))] bg-card shadow-md shadow-foreground/5"
                    >
                      {trackSuggestions.map((suggestion) => (
                        <li key={suggestion.id} className="border-b border-[hsl(var(--border))] last:border-b-0">
                          <button
                            type="button"
                            role="option"
                            className="w-full px-3 py-2 text-left text-sm font-semibold text-card-foreground hover:bg-[hsl(var(--muted)/0.5)]"
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
                        <li className="px-3 py-2 text-xs font-semibold text-muted-foreground">No matches found.</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
                <p className="min-h-4 text-xs font-semibold text-muted-foreground">
                  {selectedTrack && !intermissionOpen ? `Selected: ${selectedTrack.display}` : ""}
                </p>
              </div>
              <div className="grid gap-2 text-sm font-bold text-card-foreground">
                <label htmlFor="artist-guess-input">Artist</label>
                <div className="relative z-20">
                  <Input
                    id="artist-guess-input"
                    placeholder="Type at least 2 chars"
                    className="h-11 border-[hsl(var(--input))] bg-[hsl(var(--muted)/0.35)] text-card-foreground placeholder:text-muted-foreground"
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
                  {canEditGuess && artistInputFocused && !selectedArtist && artistQuery.trim().length >= 2 ? (
                    <ul
                      id="artist-guess-listbox"
                      role="listbox"
                      className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 max-h-40 overflow-y-auto rounded-xl border border-[hsl(var(--input))] bg-card shadow-md shadow-foreground/5"
                    >
                      {artistSuggestions.map((suggestion) => (
                        <li key={suggestion.id} className="border-b border-[hsl(var(--border))] last:border-b-0">
                          <button
                            type="button"
                            role="option"
                            className="w-full px-3 py-2 text-left text-sm font-semibold text-card-foreground hover:bg-[hsl(var(--muted)/0.5)]"
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
                        <li className="px-3 py-2 text-xs font-semibold text-muted-foreground">No matches found.</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
                <p className="min-h-4 text-xs font-semibold text-muted-foreground">
                  {selectedArtist && !intermissionOpen ? `Selected: ${selectedArtist.display}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="h-10 px-6 font-bold shadow-md shadow-[hsl(var(--primary)/0.2)]"
                onClick={submitGuess}
                disabled={!canSubmitGuess}
              >
                Lock Guess
              </Button>
              <Button
                variant="outline"
                className="h-10 border-[hsl(var(--input))] bg-card text-card-foreground hover:bg-[hsl(var(--muted)/0.5)]"
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

            <div className="rounded-2xl border border-[hsl(var(--input))] bg-[hsl(var(--secondary)/0.35)] p-3">
              <p className="text-sm font-bold text-card-foreground">Timeline placement</p>
              <p className="text-xs font-semibold text-muted-foreground">
                {currentSubmission
                  ? "Drag the release year between items. You can keep moving it until the timer ends."
                  : "Lock your guess to unlock timeline placement."}
              </p>
              {currentSubmission ? (
                <p className="mt-1 text-xs font-semibold text-muted-foreground" role="status" aria-live="polite">
                  Current position: {timelinePositionLabel ?? "Not placed"}
                </p>
              ) : null}
              <div className="mt-3 rounded-xl border-2 border-dashed border-[hsl(var(--input))] bg-[hsl(var(--card)/0.7)] px-3 py-2">
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
                  className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                    canSubmitTimeline
                      ? "cursor-grab border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]"
                      : "border-[hsl(var(--input))] bg-[hsl(var(--muted)/0.35)] text-muted-foreground"
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
                        className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                          timelineDragging
                            ? "border-dashed border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.05)] text-[hsl(var(--primary))]"
                            : canSubmitTimeline
                              ? "cursor-grab border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]"
                              : "border-[hsl(var(--input))] bg-[hsl(var(--muted)/0.35)] text-muted-foreground"
                        }`}
                      >
                        Release year
                      </div>
                    ) : null}
                    <div
                      data-timeline-entry="true"
                      onDragOver={(event) => handleTimelineItemDragOver(event, index)}
                      className="rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--secondary)/0.55)] px-3 py-2 text-sm font-bold text-card-foreground"
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
                    className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                      timelineDragging
                        ? "border-dashed border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.05)] text-[hsl(var(--primary))]"
                        : canSubmitTimeline
                          ? "cursor-grab border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]"
                          : "border-[hsl(var(--input))] bg-[hsl(var(--muted)/0.35)] text-muted-foreground"
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
        )}

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
