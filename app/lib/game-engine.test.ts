import { describe, expect, it } from "vitest";

import { advanceRoomPhase, createLobbyState, phaseDurations, startRoomGame, type RoomState } from "~/lib/game-engine";
import { mockRounds } from "~/lib/mock-room";

function buildRunningState(at: number): RoomState {
  const lobby = createLobbyState("room-1", at);
  const seededLobby: RoomState = {
    ...lobby,
    participants: [
      {
        id: "p1",
        name: "Player One",
        color: "#4ec7e0",
        joinedAt: at,
        lastSeenAt: at,
      },
    ],
    allowedPlayerIds: ["p1"],
  };

  return startRoomGame(seededLobby, at);
}

describe("game-engine scoring", () => {
  it("keeps listen duration at 45 seconds", () => {
    expect(phaseDurations.LISTEN).toBe(45_000);
  });

  it("awards 1 point each for correct title and artist", () => {
    const at = 1_000_000;
    const state = buildRunningState(at);
    const round = mockRounds[0]!;

    const withSubmissions: RoomState = {
      ...state,
      guessSubmissions: {
        [`p1:${round.id}`]: {
          playerId: "p1",
          roundId: round.id,
          trackId: round.trackId,
          artistId: round.artistId,
          submittedAt: at + 5_000,
        },
      },
    };

    const revealState = advanceRoomPhase(withSubmissions, withSubmissions.phaseEndsAt);
    const breakdown = revealState.roundBreakdowns[round.id]!.players.p1!;

    expect(revealState.phase).toBe("REVEAL");
    expect(breakdown.guessCorrect.track).toBe(true);
    expect(breakdown.guessCorrect.artist).toBe(true);
    expect(breakdown.timelineCorrect).toBe(false);
    expect(breakdown.points.track).toBe(1);
    expect(breakdown.points.artist).toBe(1);
    expect(breakdown.points.timeline).toBe(0);
    expect(breakdown.points.speed).toBe(0);
    expect(breakdown.points.total).toBe(2);
    expect(revealState.scores.p1).toBe(2);
  });

  it("awards the title point even when the artist guess is wrong", () => {
    const at = 2_000_000;
    const state = buildRunningState(at);
    const round = mockRounds[0]!;

    const withWrongArtist: RoomState = {
      ...state,
      guessSubmissions: {
        [`p1:${round.id}`]: {
          playerId: "p1",
          roundId: round.id,
          trackId: round.trackId,
          artistId: mockRounds[1]!.artistId,
          submittedAt: at + 10_000,
        },
      },
    };

    const revealState = advanceRoomPhase(withWrongArtist, withWrongArtist.phaseEndsAt);
    const breakdown = revealState.roundBreakdowns[round.id]!.players.p1!;

    expect(breakdown.guessCorrect.track).toBe(true);
    expect(breakdown.guessCorrect.artist).toBe(false);
    expect(breakdown.timelineCorrect).toBe(false);
    expect(breakdown.points.timeline).toBe(0);
    expect(breakdown.points.speed).toBe(0);
    expect(breakdown.points.track).toBe(1);
    expect(breakdown.points.artist).toBe(0);
    expect(breakdown.points.total).toBe(1);
  });

  it("allows partial guesses with only the artist point", () => {
    const at = 3_000_000;
    const state = buildRunningState(at);
    const round = mockRounds[0]!;

    const withArtistOnly: RoomState = {
      ...state,
      guessSubmissions: {
        [`p1:${round.id}`]: {
          playerId: "p1",
          roundId: round.id,
          trackId: "",
          artistId: round.artistId,
          submittedAt: at + 3_000,
        },
      },
    };

    const revealState = advanceRoomPhase(withArtistOnly, withArtistOnly.phaseEndsAt);
    const breakdown = revealState.roundBreakdowns[round.id]!.players.p1!;

    expect(breakdown.guessCorrect.track).toBe(false);
    expect(breakdown.guessCorrect.artist).toBe(true);
    expect(breakdown.points.track).toBe(0);
    expect(breakdown.points.artist).toBe(1);
    expect(breakdown.points.timeline).toBe(0);
    expect(breakdown.points.speed).toBe(0);
    expect(breakdown.points.total).toBe(1);
  });
});
