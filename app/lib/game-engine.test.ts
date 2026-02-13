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

  it("resolves guess and timeline points from guess lock time", () => {
    const at = 1_000_000;
    const state = buildRunningState(at);
    const round = mockRounds[0]!;
    const guessSubmittedAt = at + 5_000;
    const timelineMovedAt = at + 44_000;

    const withSubmissions: RoomState = {
      ...state,
      guessSubmissions: {
        [`p1:${round.id}`]: {
          playerId: "p1",
          roundId: round.id,
          trackId: round.trackId,
          artistId: round.artistId,
          submittedAt: guessSubmittedAt,
        },
      },
      timelineSubmissions: {
        [`p1:${round.id}`]: {
          playerId: "p1",
          roundId: round.id,
          insertIndex: 2,
          submittedAt: timelineMovedAt,
        },
      },
    };

    const revealState = advanceRoomPhase(withSubmissions, withSubmissions.phaseEndsAt);
    const breakdown = revealState.roundBreakdowns[round.id]!.players.p1!;

    expect(revealState.phase).toBe("REVEAL");
    expect(breakdown.guessCorrect.track).toBe(true);
    expect(breakdown.guessCorrect.artist).toBe(true);
    expect(breakdown.timelineCorrect).toBe(true);
    expect(breakdown.points.track).toBe(889);
    expect(breakdown.points.artist).toBe(533);
    expect(breakdown.points.timeline).toBe(711);
    expect(breakdown.points.total).toBe(2133);
    expect(revealState.scores.p1).toBe(2133);
  });

  it("does not award timeline points when placement is wrong", () => {
    const at = 2_000_000;
    const state = buildRunningState(at);
    const round = mockRounds[0]!;

    const withWrongTimeline: RoomState = {
      ...state,
      guessSubmissions: {
        [`p1:${round.id}`]: {
          playerId: "p1",
          roundId: round.id,
          trackId: round.trackId,
          artistId: round.artistId,
          submittedAt: at + 10_000,
        },
      },
      timelineSubmissions: {
        [`p1:${round.id}`]: {
          playerId: "p1",
          roundId: round.id,
          insertIndex: 1,
          submittedAt: at + 12_000,
        },
      },
    };

    const revealState = advanceRoomPhase(withWrongTimeline, withWrongTimeline.phaseEndsAt);
    const breakdown = revealState.roundBreakdowns[round.id]!.players.p1!;

    expect(breakdown.timelineCorrect).toBe(false);
    expect(breakdown.points.timeline).toBe(0);
  });
});
