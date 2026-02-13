import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Route } from "./+types/play-game";
import { Link } from "react-router";

import { PlayerChip } from "~/components/player-chip";
import { Ribbon } from "~/components/ribbon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import { searchAutocomplete, type AutocompleteItem } from "~/lib/autocomplete";
import { phaseDurations, phaseLabel, useRoomState } from "~/lib/game-engine";
import { buildMockAutocompletePack } from "~/lib/mock-autocomplete";
import { mockRounds } from "~/lib/mock-room";
import { usePlayerPresence } from "~/lib/player-presence";
import { getPlayerSession } from "~/lib/player-session";
import { buildTimelineEntries, clampTimelineInsertIndex, timelineEntryLabel } from "~/lib/timeline";

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
  const playerSession = useMemo(() => getPlayerSession(roomId), [roomId]);
  usePlayerPresence(playerSession, room.controls);

  const autocomplete = useMemo(() => buildMockAutocompletePack(), []);
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

  const timelineEntries = useMemo(
    () => buildTimelineEntries(room.state.timelineRoundIds, mockRounds),
    [room.state.timelineRoundIds],
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

  const revealOpen = room.state.phase === "REVEAL" || room.state.lifecycle === "finished";
  const intermissionOpen = room.state.phase === "INTERMISSION";
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

  return (
    <main className="jam-page">
      <section className="jam-stage w-full max-w-5xl">
        <Ribbon tone="cool">Player Round</Ribbon>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Badge>{room.state.lifecycle.toUpperCase()}</Badge>
          <Badge variant="warning">Round {room.state.roundIndex + 1}</Badge>
          <Badge variant={room.state.phase === "LISTEN" ? "success" : "default"}>
            {phaseLabel(room.state.phase)}
          </Badge>
          <Badge variant="default">Score {currentScore}</Badge>
        </div>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>{phaseLabel(room.state.phase)} Phase</CardTitle>
            <CardDescription>{phaseInstruction(room.state.phase)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} />
            <p className="text-right text-sm font-bold text-[#2d2a77]">
              {room.state.lifecycle === "running" ? `${Math.ceil(room.remainingMs / 1000)}s` : "Waiting"}
            </p>

            <div className="rounded-2xl border-2 border-[#2f4eb8] bg-[#eef4ff] p-4 text-[#1f1f55]">
              {intermissionOpen ? (
                <>
                  <p className="font-[var(--font-display)] text-2xl text-[#243a84]">Intermission</p>
                  <p className="font-bold">Next track is loading</p>
                  <p className="text-sm">Get ready for the next round.</p>
                </>
              ) : revealOpen ? (
                <>
                  <p className="font-[var(--font-display)] text-2xl text-[#243a84]">{room.round.title}</p>
                  <p className="font-bold">{room.round.artist}</p>
                  <p className="text-sm">Timeline answer: {room.round.year}</p>
                </>
              ) : (
                <>
                  <p className="font-[var(--font-display)] text-2xl text-[#243a84]">Now Listening...</p>
                  <p className="font-bold">Answer hidden until reveal</p>
                  <p className="text-sm">Use autocomplete to lock your guess in this phase.</p>
                </>
              )}
            </div>

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
                  disabled={!canEditGuess}
                />
                {selectedTrack && !intermissionOpen ? (
                  <span className="text-xs font-semibold text-[#22438f]">Selected: {selectedTrack.display}</span>
                ) : null}
                {canEditGuess && trackInputFocused && !selectedTrack && trackQuery.trim().length >= 2 ? (
                  <ul className="max-h-40 overflow-y-auto rounded-xl border-2 border-[#2f4eb8] bg-white/90">
                    {trackSuggestions.map((suggestion) => (
                      <li key={suggestion.id} className="border-b border-[#cad8ff] last:border-b-0">
                        <button
                          type="button"
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
                  disabled={!canEditGuess}
                />
                {selectedArtist && !intermissionOpen ? (
                  <span className="text-xs font-semibold text-[#22438f]">Selected: {selectedArtist.display}</span>
                ) : null}
                {canEditGuess && artistInputFocused && !selectedArtist && artistQuery.trim().length >= 2 ? (
                  <ul className="max-h-40 overflow-y-auto rounded-xl border-2 border-[#2f4eb8] bg-white/90">
                    {artistSuggestions.map((suggestion) => (
                      <li key={suggestion.id} className="border-b border-[#cad8ff] last:border-b-0">
                        <button
                          type="button"
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
                >
                  Release year
                </div>
              </div>
              <div
                ref={timelineListRef}
                className="mt-3 space-y-2"
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
                  <div key={entry.id} className="space-y-2">
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

            {currentSubmission && revealOpen ? (
              <div className="rounded-2xl border-2 border-[#29459c] bg-[#fff8dd] p-3">
                <p className="text-sm font-bold text-[#243a84]">Reveal check</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant={trackCorrect ? "success" : "warning"}>
                    Song: {trackCorrect ? "correct" : "incorrect"}
                  </Badge>
                  <Badge variant={artistCorrect ? "success" : "warning"}>
                    Artist: {artistCorrect ? "correct" : "incorrect"}
                  </Badge>
                  <Badge variant={playerBreakdown?.timelineCorrect ? "success" : "warning"}>
                    Timeline: {playerBreakdown?.timelineCorrect ? "correct" : "incorrect"}
                  </Badge>
                  {playerBreakdown ? (
                    <Badge variant="default">
                      +{playerBreakdown.points.total} ({playerBreakdown.points.track}/{playerBreakdown.points.artist}/
                      {playerBreakdown.points.timeline})
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Players</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap justify-center gap-2">
              {room.state.participants.map((player) => (
                <PlayerChip key={player.id} player={player} />
              ))}
            </ul>
            {room.state.participants.length === 0 ? (
              <p className="text-center text-sm font-semibold text-[#51449e]">No players connected yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link to={`/play/lobby/${roomId}`}>Back To Lobby</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={`/results/${roomId}`}>Open Results</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
