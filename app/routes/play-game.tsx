import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type RefObject, type SetStateAction } from "react";
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

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Player Game" }];
}

type PendingGuess = {
  trackId: string;
  artistId: string;
};

type StateSetter<T> = Dispatch<SetStateAction<T>>;

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
  const [trackActiveSuggestionIndex, setTrackActiveSuggestionIndex] = useState(-1);
  const [artistActiveSuggestionIndex, setArtistActiveSuggestionIndex] = useState(-1);
  const [pendingGuess, setPendingGuess] = useState<PendingGuess | null>(null);
  const trackInputRef = useRef<HTMLInputElement | null>(null);
  const artistInputRef = useRef<HTMLInputElement | null>(null);
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
  const currentSubmission = submissionKey ? room.state.guessSubmissions[submissionKey] : undefined;
  const currentSubmissionTrackId = currentSubmission?.trackId ?? "";
  const currentSubmissionArtistId = currentSubmission?.artistId ?? "";
  const savedTrackId = selectedTrack?.id ?? currentSubmissionTrackId;
  const savedArtistId = selectedArtist?.id ?? currentSubmissionArtistId;
  const pendingGuessOutOfSync =
    pendingGuess !== null &&
    (pendingGuess.trackId !== currentSubmissionTrackId || pendingGuess.artistId !== currentSubmissionArtistId);
  const playerEligible = playerSession ? room.state.allowedPlayerIds.includes(playerSession.id) : false;
  const canEditGuess =
    room.state.lifecycle === "running" && room.state.phase === "LISTEN" && Boolean(playerSession) && playerEligible;
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
  const isTrackAutocompleteOpen =
    canEditGuess && trackInputFocused && !selectedTrack && trackQuery.trim().length >= 2;
  const isArtistAutocompleteOpen =
    canEditGuess && artistInputFocused && !selectedArtist && artistQuery.trim().length >= 2;

  const closeAutocomplete = (
    setFocused: StateSetter<boolean>,
    setActiveSuggestionIndex: StateSetter<number>,
  ) => {
    setFocused(false);
    setActiveSuggestionIndex(-1);
  };

  const focusAutocomplete = (
    setFocused: StateSetter<boolean>,
    setActiveSuggestionIndex: StateSetter<number>,
  ) => {
    setFocused(true);
    setActiveSuggestionIndex(0);
  };

  const resetGuessInputs = () => {
    setTrackQuery("");
    setArtistQuery("");
    setSelectedTrack(null);
    setSelectedArtist(null);
    setPendingGuess(null);
    closeAutocomplete(setTrackInputFocused, setTrackActiveSuggestionIndex);
    closeAutocomplete(setArtistInputFocused, setArtistActiveSuggestionIndex);
  };

  const handleGuessInputChange = ({
    nextValue,
    hasSavedGuess,
    setQuery,
    setSelected,
    setActiveSuggestionIndex,
    clearGuess,
  }: {
    nextValue: string;
    hasSavedGuess: boolean;
    setQuery: StateSetter<string>;
    setSelected: StateSetter<AutocompleteItem | null>;
    setActiveSuggestionIndex: StateSetter<number>;
    clearGuess: () => void;
  }) => {
    setQuery(nextValue);
    setSelected(null);
    setActiveSuggestionIndex(0);

    if (hasSavedGuess) {
      clearGuess();
    }
  };

  const handleGuessInputBlur = (
    setFocused: StateSetter<boolean>,
    setActiveSuggestionIndex: StateSetter<number>,
  ) => {
    window.setTimeout(() => {
      closeAutocomplete(setFocused, setActiveSuggestionIndex);
    }, 120);
  };

  const handleSuggestionKeyDown = ({
    event,
    isOpen,
    suggestions,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    closeSuggestions,
    onSelect,
  }: {
    event: KeyboardEvent<HTMLInputElement>;
    isOpen: boolean;
    suggestions: AutocompleteItem[];
    activeSuggestionIndex: number;
    setActiveSuggestionIndex: StateSetter<number>;
    closeSuggestions: () => void;
    onSelect: (suggestion: AutocompleteItem) => void;
  }) => {
    if (!isOpen || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current < 0 ? 0 : (current + 1) % suggestions.length));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((current) =>
        current < 0 ? suggestions.length - 1 : (current - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selectedIndex = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
      const suggestion = suggestions[selectedIndex];
      if (suggestion) {
        onSelect(suggestion);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSuggestions();
    }
  };

  const selectGuessSuggestion = ({
    suggestion,
    setSelected,
    setQuery,
    closeSuggestions,
    trackId,
    artistId,
  }: {
    suggestion: AutocompleteItem;
    setSelected: StateSetter<AutocompleteItem | null>;
    setQuery: StateSetter<string>;
    closeSuggestions: () => void;
    trackId: string;
    artistId: string;
  }) => {
    setSelected(suggestion);
    setQuery(suggestion.display);
    closeSuggestions();
    syncGuess(trackId, artistId);
  };

  const clearGuessField = ({
    setSelected,
    setQuery,
    focusSuggestions,
    inputRef,
    trackId,
    artistId,
  }: {
    setSelected: StateSetter<AutocompleteItem | null>;
    setQuery: StateSetter<string>;
    focusSuggestions: () => void;
    inputRef: RefObject<HTMLInputElement | null>;
    trackId: string;
    artistId: string;
  }) => {
    setSelected(null);
    setQuery("");
    focusSuggestions();
    inputRef.current?.focus();
    syncGuess(trackId, artistId);
  };

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
    resetGuessInputs();
  }, [room.round.id]);

  useEffect(() => {
    if (room.state.phase !== "INTERMISSION") {
      return;
    }

    resetGuessInputs();
  }, [room.state.phase]);

  useEffect(() => {
    if (room.state.phase === "INTERMISSION" || pendingGuessOutOfSync) {
      return;
    }

    const nextTrackId = currentSubmissionTrackId;
    const nextArtistId = currentSubmissionArtistId;
    const nextTrack = nextTrackId ? trackLookup[nextTrackId] : undefined;
    const nextArtist = nextArtistId ? artistLookup[nextArtistId] : undefined;

    if (nextTrack && selectedTrack?.id !== nextTrack.id) {
      setSelectedTrack(nextTrack);
      setTrackQuery(nextTrack.display);
    } else if (!nextTrackId && selectedTrack) {
      setSelectedTrack(null);
      if (!trackInputFocused) {
        setTrackQuery("");
      }
    }

    if (nextArtist && selectedArtist?.id !== nextArtist.id) {
      setSelectedArtist(nextArtist);
      setArtistQuery(nextArtist.display);
    } else if (!nextArtistId && selectedArtist) {
      setSelectedArtist(null);
      if (!artistInputFocused) {
        setArtistQuery("");
      }
    }
  }, [
    currentSubmissionArtistId,
    currentSubmissionTrackId,
    pendingGuessOutOfSync,
    artistInputFocused,
    artistLookup,
    room.state.phase,
    trackInputFocused,
    trackLookup,
  ]);

  useEffect(() => {
    if (!pendingGuess) {
      return;
    }

    if (
      pendingGuess.trackId === currentSubmissionTrackId &&
      pendingGuess.artistId === currentSubmissionArtistId
    ) {
      setPendingGuess(null);
    }
  }, [currentSubmissionArtistId, currentSubmissionTrackId, pendingGuess]);

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

  useEffect(() => {
    if (trackSuggestions.length === 0) {
      setTrackActiveSuggestionIndex(-1);
      return;
    }

    setTrackActiveSuggestionIndex((current) =>
      current >= 0 && current < trackSuggestions.length ? current : 0,
    );
  }, [trackSuggestions]);

  useEffect(() => {
    if (artistSuggestions.length === 0) {
      setArtistActiveSuggestionIndex(-1);
      return;
    }

    setArtistActiveSuggestionIndex((current) =>
      current >= 0 && current < artistSuggestions.length ? current : 0,
    );
  }, [artistSuggestions]);

  const syncGuess = (trackId: string, artistId: string) => {
    if (!playerSession || !playerEligible) {
      return;
    }

    setPendingGuess({ trackId, artistId });
    room.controls.submitGuess({
      playerId: playerSession.id,
      roundId: room.round.id,
      trackId,
      artistId,
    });
  };

  const closeTrackAutocomplete = () => {
    closeAutocomplete(setTrackInputFocused, setTrackActiveSuggestionIndex);
  };

  const closeArtistAutocomplete = () => {
    closeAutocomplete(setArtistInputFocused, setArtistActiveSuggestionIndex);
  };

  const focusTrackAutocomplete = () => {
    focusAutocomplete(setTrackInputFocused, setTrackActiveSuggestionIndex);
  };

  const focusArtistAutocomplete = () => {
    focusAutocomplete(setArtistInputFocused, setArtistActiveSuggestionIndex);
  };

  const selectTrackSuggestion = (suggestion: AutocompleteItem) => {
    selectGuessSuggestion({
      suggestion,
      setSelected: setSelectedTrack,
      setQuery: setTrackQuery,
      closeSuggestions: closeTrackAutocomplete,
      trackId: suggestion.id,
      artistId: savedArtistId,
    });
  };

  const selectArtistSuggestion = (suggestion: AutocompleteItem) => {
    selectGuessSuggestion({
      suggestion,
      setSelected: setSelectedArtist,
      setQuery: setArtistQuery,
      closeSuggestions: closeArtistAutocomplete,
      trackId: savedTrackId,
      artistId: suggestion.id,
    });
  };

  const clearTrackGuess = () => {
    clearGuessField({
      setSelected: setSelectedTrack,
      setQuery: setTrackQuery,
      focusSuggestions: focusTrackAutocomplete,
      inputRef: trackInputRef,
      trackId: "",
      artistId: savedArtistId,
    });
  };

  const clearArtistGuess = () => {
    clearGuessField({
      setSelected: setSelectedArtist,
      setQuery: setArtistQuery,
      focusSuggestions: focusArtistAutocomplete,
      inputRef: artistInputRef,
      trackId: savedTrackId,
      artistId: "",
    });
  };

  const trackCorrect = currentSubmission?.trackId === room.round.trackId;
  const artistCorrect = currentSubmission?.artistId === room.round.artistId;
  const hasTrackGuess = Boolean(currentSubmission?.trackId);
  const hasArtistGuess = Boolean(currentSubmission?.artistId);
  const guessPending = room.state.phase === "LISTEN" && !hasTrackGuess && !hasArtistGuess;
  const displayedTrackQuery = intermissionOpen ? "" : trackQuery;
  const displayedArtistQuery = intermissionOpen ? "" : artistQuery;
  const playerBreakdown =
    playerSession && room.state.roundBreakdowns[room.round.id]
      ? room.state.roundBreakdowns[room.round.id]!.players[playerSession.id]
      : undefined;
  const currentScore = playerSession ? room.state.scores[playerSession.id] ?? 0 : 0;

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
  ];
  const intermissionCompactView = intermissionOpen;
  const layoutWidthClass = room.state.phase === "REVEAL" || intermissionCompactView || finishedGame ? "max-w-lg" : "max-w-3xl";
  const winnerScore = leaderboard[0]?.score ?? currentScore;
  const songsPlayed = room.state.rounds;

  return (
    <GameLayout className={`mx-auto ${layoutWidthClass}`}>
      <div className="animate-slide-up flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="listening">Round {room.state.roundIndex + 1}</Badge>
            <Badge variant="default">
              {playerSession ? `Score ${currentScore} · ${playerSession.name}` : `Score ${currentScore}`}
            </Badge>
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

            <GameCard className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Music className="h-4 w-4 text-[hsl(var(--accent))]" />
                <p className="text-sm font-bold text-card-foreground">Songs Played</p>
              </div>
              {songsPlayed.length > 0 ? (
                <ol className="space-y-2">
                  {songsPlayed.map((round, index) => (
                    <li key={round.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/35 p-3">
                      {round.coverUrl ? (
                        <img
                          src={round.coverUrl}
                          alt={`${round.title} cover art`}
                          className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60">
                          <Music className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-card-foreground">{round.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{round.artist}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-card-foreground">{round.year}</p>
                        <p className="text-[10px] text-muted-foreground">#{index + 1}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs font-semibold text-muted-foreground">No rounds recorded for this game.</p>
              )}
            </GameCard>
          </>
        ) : room.state.phase === "REVEAL" ? (
          <>
            <GameCard className="relative overflow-hidden border-accent/30 p-6">
              <div className="absolute inset-x-0 top-0 h-1 bg-[hsl(var(--accent))]" />
              <div className="flex flex-col gap-4">
                {room.round.coverUrl ? (
                  <img
                    src={room.round.coverUrl}
                    alt={`${room.round.title} cover art`}
                    className="h-72 w-full rounded-xl border border-border object-cover md:h-80"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-72 w-full items-center justify-center rounded-xl bg-accent/10 md:h-80">
                    <Music className="h-20 w-20 text-[hsl(var(--accent))]" />
                  </div>
                )}
                <div className="text-center">
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
                <div>
                  <p className="text-xl font-bold text-card-foreground">Intermission</p>
                  <p className="text-sm text-muted-foreground">Quick vibe check before the next song</p>
                </div>

                <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] p-3 text-left">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Song Revealed</p>
                  <div className="space-y-3">
                    {room.round.coverUrl ? (
                      <img
                        src={room.round.coverUrl}
                        alt={`${room.round.title} cover art`}
                        className="h-60 w-full rounded-lg border border-border object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-60 w-full items-center justify-center rounded-lg border border-border bg-muted/60">
                        <Music className="h-16 w-16 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 text-center">
                      <p className="line-clamp-2 text-xl font-bold text-card-foreground">{room.round.title}</p>
                      <p className="line-clamp-1 text-base font-semibold text-muted-foreground">{room.round.artist}</p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">Released in {room.round.year}</p>
                    </div>
                  </div>
                </div>

                <div className="relative max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-4">
                  <div className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]" />
                  <div className="relative">
                    <Quote className="absolute -left-0.5 -top-0.5 h-4 w-4 text-[hsl(var(--primary)/0.4)]" />
                    <Quote className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rotate-180 text-[hsl(var(--primary)/0.4)]" />
                    <p className="pl-5 pr-5 text-sm italic leading-relaxed text-card-foreground">
                      {intermissionQuote}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <CatMascot variant="chill" size="lg" className="animate-float" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cat Wisdom</p>
                </div>

                <div className="flex items-center justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.05)]">
                    <span className="animate-count-pulse font-mono text-3xl font-bold text-[hsl(var(--primary))]">
                      {remainingSeconds}
                    </span>
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
                      <p className="text-xs text-muted-foreground">
                        Pick one autocomplete option per field. Your latest selection is your live guess.
                      </p>
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
                <div className="relative z-20 focus-within:z-50">
                  <Input
                    id="track-guess-input"
                    ref={trackInputRef}
                    placeholder="Type at least 2 chars"
                    className={`h-11 pr-10 border-2 text-card-foreground placeholder:text-muted-foreground transition-colors ${
                      selectedTrack
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] ring-2 ring-[hsl(var(--primary)/0.15)]"
                        : "border-[hsl(var(--input))] bg-[hsl(var(--muted)/0.35)]"
                    }`}
                    value={displayedTrackQuery}
                    onChange={(event) => {
                      handleGuessInputChange({
                        nextValue: event.target.value,
                        hasSavedGuess: Boolean(selectedTrack || currentSubmissionTrackId),
                        setQuery: setTrackQuery,
                        setSelected: setSelectedTrack,
                        setActiveSuggestionIndex: setTrackActiveSuggestionIndex,
                        clearGuess: () => syncGuess("", savedArtistId),
                      });
                    }}
                    onFocus={focusTrackAutocomplete}
                    onBlur={() => {
                      handleGuessInputBlur(setTrackInputFocused, setTrackActiveSuggestionIndex);
                    }}
                    onKeyDown={(event) => {
                      handleSuggestionKeyDown({
                        event,
                        isOpen: isTrackAutocompleteOpen,
                        suggestions: trackSuggestions,
                        activeSuggestionIndex: trackActiveSuggestionIndex,
                        setActiveSuggestionIndex: setTrackActiveSuggestionIndex,
                        closeSuggestions: closeTrackAutocomplete,
                        onSelect: selectTrackSuggestion,
                      });
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="search"
                    aria-autocomplete="list"
                    aria-controls="track-guess-listbox"
                    aria-expanded={isTrackAutocompleteOpen}
                    aria-activedescendant={
                      isTrackAutocompleteOpen && trackActiveSuggestionIndex >= 0
                        ? `track-guess-option-${trackActiveSuggestionIndex}`
                        : undefined
                    }
                    disabled={!canEditGuess}
                  />
                  {canEditGuess && displayedTrackQuery.length > 0 ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--muted)/0.8)] hover:text-card-foreground"
                      onPointerDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={clearTrackGuess}
                      aria-label="Clear song title"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  ) : null}
                  {isTrackAutocompleteOpen ? (
                    <ul
                      id="track-guess-listbox"
                      role="listbox"
                      className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-40 overflow-y-auto rounded-xl border border-[hsl(var(--input))] bg-card shadow-md shadow-foreground/5"
                    >
                      {trackSuggestions.map((suggestion, suggestionIndex) => (
                        <li
                          key={suggestion.id}
                          className="border-b border-[hsl(var(--border))] last:border-b-0"
                        >
                          <button
                            id={`track-guess-option-${suggestionIndex}`}
                            type="button"
                            role="option"
                            aria-selected={trackActiveSuggestionIndex === suggestionIndex}
                            className={`w-full px-3 py-2 text-left text-sm font-semibold text-card-foreground hover:bg-[hsl(var(--muted)/0.5)] ${
                              trackActiveSuggestionIndex === suggestionIndex
                                ? "bg-[hsl(var(--muted)/0.65)]"
                                : ""
                            }`}
                            onPointerDown={(event) => {
                              event.preventDefault();
                            }}
                            onMouseEnter={() => {
                              setTrackActiveSuggestionIndex(suggestionIndex);
                            }}
                            onClick={() => {
                              selectTrackSuggestion(suggestion);
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
                  {selectedTrack && !intermissionOpen
                    ? `Selected title: ${selectedTrack.display}`
                    : displayedTrackQuery.trim().length >= 2
                      ? "Pick one suggestion to make this count."
                      : "Type and choose from the list."}
                </p>
              </div>
              <div className="grid gap-2 text-sm font-bold text-card-foreground">
                <label htmlFor="artist-guess-input">Artist</label>
                <div className="relative z-20 focus-within:z-50">
                  <Input
                    id="artist-guess-input"
                    ref={artistInputRef}
                    placeholder="Type at least 2 chars"
                    className={`h-11 pr-10 border-2 text-card-foreground placeholder:text-muted-foreground transition-colors ${
                      selectedArtist
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] ring-2 ring-[hsl(var(--primary)/0.15)]"
                        : "border-[hsl(var(--input))] bg-[hsl(var(--muted)/0.35)]"
                    }`}
                    value={displayedArtistQuery}
                    onChange={(event) => {
                      handleGuessInputChange({
                        nextValue: event.target.value,
                        hasSavedGuess: Boolean(selectedArtist || currentSubmissionArtistId),
                        setQuery: setArtistQuery,
                        setSelected: setSelectedArtist,
                        setActiveSuggestionIndex: setArtistActiveSuggestionIndex,
                        clearGuess: () => syncGuess(savedTrackId, ""),
                      });
                    }}
                    onFocus={focusArtistAutocomplete}
                    onBlur={() => {
                      handleGuessInputBlur(setArtistInputFocused, setArtistActiveSuggestionIndex);
                    }}
                    onKeyDown={(event) => {
                      handleSuggestionKeyDown({
                        event,
                        isOpen: isArtistAutocompleteOpen,
                        suggestions: artistSuggestions,
                        activeSuggestionIndex: artistActiveSuggestionIndex,
                        setActiveSuggestionIndex: setArtistActiveSuggestionIndex,
                        closeSuggestions: closeArtistAutocomplete,
                        onSelect: selectArtistSuggestion,
                      });
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="search"
                    aria-autocomplete="list"
                    aria-controls="artist-guess-listbox"
                    aria-expanded={isArtistAutocompleteOpen}
                    aria-activedescendant={
                      isArtistAutocompleteOpen && artistActiveSuggestionIndex >= 0
                        ? `artist-guess-option-${artistActiveSuggestionIndex}`
                        : undefined
                    }
                    disabled={!canEditGuess}
                  />
                  {canEditGuess && displayedArtistQuery.length > 0 ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--muted)/0.8)] hover:text-card-foreground"
                      onPointerDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={clearArtistGuess}
                      aria-label="Clear artist"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  ) : null}
                  {isArtistAutocompleteOpen ? (
                    <ul
                      id="artist-guess-listbox"
                      role="listbox"
                      className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-40 overflow-y-auto rounded-xl border border-[hsl(var(--input))] bg-card shadow-md shadow-foreground/5"
                    >
                      {artistSuggestions.map((suggestion, suggestionIndex) => (
                        <li
                          key={suggestion.id}
                          className="border-b border-[hsl(var(--border))] last:border-b-0"
                        >
                          <button
                            id={`artist-guess-option-${suggestionIndex}`}
                            type="button"
                            role="option"
                            aria-selected={artistActiveSuggestionIndex === suggestionIndex}
                            className={`w-full px-3 py-2 text-left text-sm font-semibold text-card-foreground hover:bg-[hsl(var(--muted)/0.5)] ${
                              artistActiveSuggestionIndex === suggestionIndex
                                ? "bg-[hsl(var(--muted)/0.65)]"
                                : ""
                            }`}
                            onPointerDown={(event) => {
                              event.preventDefault();
                            }}
                            onMouseEnter={() => {
                              setArtistActiveSuggestionIndex(suggestionIndex);
                            }}
                            onClick={() => {
                              selectArtistSuggestion(suggestion);
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
                  {selectedArtist && !intermissionOpen
                    ? `Selected artist: ${selectedArtist.display}`
                    : displayedArtistQuery.trim().length >= 2
                      ? "Pick one suggestion to make this count."
                      : "Type and choose from the list."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">              
              {guessPending ? <Badge variant="warning">Waiting for your selections</Badge> : null}
              {hasTrackGuess ? <Badge variant="success">Title saved</Badge> : null}
              {hasArtistGuess ? <Badge variant="success">Artist saved</Badge> : null}
              {!playerSession && room.state.phase === "LISTEN" ? (
                <Badge variant="warning">Join with player name to submit</Badge>
              ) : null}
              {playerSession && room.state.phase === "LISTEN" && !playerEligible ? (
                <Badge variant="warning">Spectating only: joined after game start</Badge>
              ) : null}
            </div>

            <div className="rounded-2xl border border-[hsl(var(--input))] bg-[hsl(var(--secondary)/0.35)] p-4">
              <p className="text-sm font-bold text-card-foreground">Quick rules</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                You can change either answer until the timer ends. Only highlighted selections count.
              </p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                Score 1 point for the correct song title and 1 point for the correct artist.
              </p>
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
