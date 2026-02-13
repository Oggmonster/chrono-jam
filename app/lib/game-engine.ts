import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { defaultPlaylistIds } from "~/lib/gamepack";
import { mockRounds } from "~/lib/mock-room";
import { buildTimelineEntries, clampTimelineInsertIndex, isTimelineInsertCorrect } from "~/lib/timeline";

export type RoomRound = {
  id: string;
  trackId: string;
  title: string;
  artistId: string;
  artist: string;
  year: number;
  spotifyUri: string;
  startMs: number;
};

export type GamePhase = "LISTEN" | "REVEAL" | "INTERMISSION";
export type RoomLifecycle = "lobby" | "running" | "finished";
export type RoomParticipant = {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  lastSeenAt: number;
};

export type GuessSubmission = {
  playerId: string;
  roundId: string;
  trackId: string;
  artistId: string;
  submittedAt: number;
};

export type TimelineSubmission = {
  playerId: string;
  roundId: string;
  insertIndex: number;
  submittedAt: number;
};

export type PreloadReadiness = {
  playerId: string;
  gamePackLoaded: boolean;
  autocompleteLoaded: boolean;
  gamePackHash: string;
  updatedAt: number;
};

export type RoundPlayerBreakdown = {
  playerId: string;
  guessCorrect: {
    track: boolean;
    artist: boolean;
  };
  timelineCorrect: boolean;
  points: {
    track: number;
    artist: number;
    timeline: number;
    total: number;
  };
};

export type RoundBreakdown = {
  roundId: string;
  resolvedAt: number;
  players: Record<string, RoundPlayerBreakdown>;
};

export type RoomState = {
  roomId: string;
  lifecycle: RoomLifecycle;
  phase: GamePhase;
  roundIndex: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  updatedAt: number;
  participants: RoomParticipant[];
  allowedPlayerIds: string[];
  guessSubmissions: Record<string, GuessSubmission>;
  timelineSubmissions: Record<string, TimelineSubmission>;
  preloadReadiness: Record<string, PreloadReadiness>;
  playlistIds: string[];
  rounds: RoomRound[];
  timelineRoundIds: string[];
  scores: Record<string, number>;
  roundBreakdowns: Record<string, RoundBreakdown>;
};

type RoomRole = "host" | "player";

type RoomCommand =
  | { type: "replace_state"; state: RoomState }
  | { type: "upsert_participant"; participant: Pick<RoomParticipant, "id" | "name"> }
  | { type: "remove_participant"; participantId: string }
  | {
      type: "submit_guess";
      submission: Pick<GuessSubmission, "playerId" | "roundId" | "trackId" | "artistId">;
    }
  | {
      type: "submit_timeline";
      submission: Pick<TimelineSubmission, "playerId" | "roundId" | "insertIndex">;
    }
  | {
      type: "update_preload";
      readiness: Pick<
        PreloadReadiness,
        "playerId" | "gamePackLoaded" | "autocompleteLoaded" | "gamePackHash"
      >;
    }
  | {
      type: "update_playlist_ids";
      playlistIds: string[];
    };

type RoomHookResult = {
  state: RoomState;
  now: number;
  round: RoomRound;
  remainingMs: number;
  controls: {
    startGame: () => void;
    skipPhase: () => void;
    resetLobby: () => void;
    syncState: () => void;
    upsertParticipant: (participant: Pick<RoomParticipant, "id" | "name">) => void;
    removeParticipant: (participantId: string) => void;
    submitGuess: (
      submission: Pick<GuessSubmission, "playerId" | "roundId" | "trackId" | "artistId">,
    ) => void;
    submitTimeline: (
      submission: Pick<TimelineSubmission, "playerId" | "roundId" | "insertIndex">,
    ) => void;
    updatePreload: (
      readiness: Pick<
        PreloadReadiness,
        "playerId" | "gamePackLoaded" | "autocompleteLoaded" | "gamePackHash"
      >,
    ) => void;
    updatePlaylistIds: (playlistIds: string[]) => void;
  };
};

const phaseOrder: GamePhase[] = ["LISTEN", "REVEAL", "INTERMISSION"];
const participantColors = ["#4ec7e0", "#f28d35", "#e45395", "#7bcf4b", "#7d6cfc", "#ff7f5c"];
const participantStaleMs = 20_000;

const phaseDurationsMs: Record<GamePhase, number> = {
  LISTEN: 45_000,
  REVEAL: 8_000,
  INTERMISSION: 5_000,
};

function fallbackRounds(): RoomRound[] {
  return mockRounds.map((round) => ({
    id: round.id,
    trackId: round.trackId,
    title: round.title,
    artistId: round.artistId,
    artist: round.artist,
    year: round.year,
    spotifyUri: round.spotifyUri,
    startMs: round.startMs,
  }));
}

const scoringMaxPoints = {
  track: 1_000,
  artist: 600,
  timeline: 800,
};

function nowMs() {
  return Date.now();
}

function apiRoomPath(roomId: string) {
  return `/api/room/${encodeURIComponent(roomId)}`;
}

function apiRoomEventsPath(roomId: string) {
  return `/api/room/${encodeURIComponent(roomId)}/events`;
}

async function fetchRoomStateFromServer(roomId: string) {
  const response = await fetch(apiRoomPath(roomId), {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Room fetch failed (${response.status})`);
  }

  return normalizeRoomState((await response.json()) as RoomState);
}

async function postRoomCommand(roomId: string, command: RoomCommand) {
  const response = await fetch(apiRoomPath(roomId), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Room command failed (${response.status})`);
  }

  return normalizeRoomState((await response.json()) as RoomState);
}

function normalizeRoomState(state: RoomState): RoomState {
  const phase: GamePhase =
    state.phase === "REVEAL" || state.phase === "INTERMISSION" ? state.phase : "LISTEN";
  const allowedPlayerIds = Array.isArray(state.allowedPlayerIds)
    ? [
        ...new Set(
          state.allowedPlayerIds.filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0,
          ),
        ),
      ]
    : [...new Set(state.participants.map((participant) => participant.id))];
  const playlistIds = Array.isArray(state.playlistIds)
    ? [
        ...new Set(
          state.playlistIds.filter(
            (playlistId): playlistId is string =>
              typeof playlistId === "string" && playlistId.trim().length > 0,
          ),
        ),
      ]
    : [...defaultPlaylistIds];
  const rounds = Array.isArray(state.rounds)
    ? state.rounds.filter(
        (round): round is RoomRound =>
          typeof round?.id === "string" &&
          round.id.trim().length > 0 &&
          typeof round?.trackId === "string" &&
          round.trackId.trim().length > 0 &&
          typeof round?.title === "string" &&
          round.title.trim().length > 0 &&
          typeof round?.artistId === "string" &&
          round.artistId.trim().length > 0 &&
          typeof round?.artist === "string" &&
          round.artist.trim().length > 0 &&
          typeof round?.year === "number" &&
          Number.isFinite(round.year) &&
          typeof round?.spotifyUri === "string" &&
          round.spotifyUri.trim().length > 0 &&
          typeof round?.startMs === "number" &&
          Number.isFinite(round.startMs),
      )
    : [];
  const safeRounds = rounds.length > 0 ? rounds : fallbackRounds();
  const roundIdSet = new Set(safeRounds.map((round) => round.id));
  const parsedRoundIndex = Number.isFinite(Number(state.roundIndex)) ? Math.floor(Number(state.roundIndex)) : 0;
  const maxRoundIndex = Math.max(0, safeRounds.length - 1);

  return {
    ...state,
    phase,
    roundIndex: Math.max(0, Math.min(maxRoundIndex, parsedRoundIndex)),
    allowedPlayerIds,
    playlistIds: playlistIds.length > 0 ? playlistIds : [...defaultPlaylistIds],
    rounds: safeRounds,
    guessSubmissions:
      state.guessSubmissions && typeof state.guessSubmissions === "object" ? state.guessSubmissions : {},
    timelineSubmissions:
      state.timelineSubmissions && typeof state.timelineSubmissions === "object" ? state.timelineSubmissions : {},
    preloadReadiness:
      state.preloadReadiness && typeof state.preloadReadiness === "object" ? state.preloadReadiness : {},
    timelineRoundIds: Array.isArray(state.timelineRoundIds)
      ? state.timelineRoundIds.filter((roundId) => roundIdSet.has(roundId))
      : [],
    scores: state.scores && typeof state.scores === "object" ? state.scores : {},
    roundBreakdowns:
      state.roundBreakdowns && typeof state.roundBreakdowns === "object" ? state.roundBreakdowns : {},
  };
}

function shouldApplyRemoteState(current: RoomState, incoming: RoomState) {
  if (incoming.updatedAt > current.updatedAt) {
    return true;
  }

  if (incoming.updatedAt < current.updatedAt) {
    return false;
  }

  return (
    incoming.lifecycle !== current.lifecycle ||
    incoming.phase !== current.phase ||
    incoming.roundIndex !== current.roundIndex ||
    incoming.phaseEndsAt !== current.phaseEndsAt ||
    incoming.participants.length !== current.participants.length ||
    incoming.allowedPlayerIds.join(",") !== current.allowedPlayerIds.join(",") ||
    incoming.playlistIds.join(",") !== current.playlistIds.join(",") ||
    incoming.rounds.length !== current.rounds.length ||
    incoming.rounds.map((round) => round.id).join(",") !== current.rounds.map((round) => round.id).join(",") ||
    Object.keys(incoming.guessSubmissions).length !== Object.keys(current.guessSubmissions).length ||
    Object.keys(incoming.timelineSubmissions).length !== Object.keys(current.timelineSubmissions).length ||
    JSON.stringify(incoming.preloadReadiness) !== JSON.stringify(current.preloadReadiness) ||
    incoming.timelineRoundIds.join(",") !== current.timelineRoundIds.join(",") ||
    Object.keys(incoming.scores).length !== Object.keys(current.scores).length ||
    Object.keys(incoming.roundBreakdowns).length !== Object.keys(current.roundBreakdowns).length
  );
}

function colorForParticipantIndex(index: number) {
  return participantColors[index % participantColors.length]!;
}

export function createLobbyState(roomId: string, at = nowMs()): RoomState {
  return {
    roomId,
    lifecycle: "lobby",
    phase: "LISTEN",
    roundIndex: 0,
    phaseStartedAt: at,
    phaseEndsAt: at,
    updatedAt: at,
    participants: [],
    allowedPlayerIds: [],
    guessSubmissions: {},
    timelineSubmissions: {},
    preloadReadiness: {},
    playlistIds: [...defaultPlaylistIds],
    rounds: fallbackRounds(),
    timelineRoundIds: [],
    scores: {},
    roundBreakdowns: {},
  };
}

function withPhase(
  state: RoomState,
  phase: GamePhase,
  roundIndex: number,
  at: number,
  lifecycle: RoomLifecycle,
): RoomState {
  return {
    ...state,
    lifecycle,
    phase,
    roundIndex,
    phaseStartedAt: at,
    phaseEndsAt: lifecycle === "running" ? at + phaseDurationsMs[phase] : at,
    updatedAt: at,
  };
}

export function startRoomGame(state: RoomState, at = nowMs()): RoomState {
  const lockedPlayerIds = [...new Set(state.participants.map((participant) => participant.id))];
  return {
    ...withPhase(state, "LISTEN", 0, at, "running"),
    allowedPlayerIds: lockedPlayerIds,
    guessSubmissions: {},
    timelineSubmissions: {},
    preloadReadiness: {},
    timelineRoundIds: [],
    scores: {},
    roundBreakdowns: {},
  };
}

export function advanceRoomPhase(state: RoomState, at = nowMs()): RoomState {
  if (state.lifecycle !== "running") {
    return state;
  }

  const phaseIndex = phaseOrder.indexOf(state.phase);
  const nextPhase = phaseOrder[(phaseIndex + 1) % phaseOrder.length];

  if (state.phase === "INTERMISSION") {
    const isLastRound = state.roundIndex >= state.rounds.length - 1;
    if (isLastRound) {
      return {
        ...state,
        lifecycle: "finished",
        phase: "REVEAL",
        phaseStartedAt: at,
        phaseEndsAt: at,
        updatedAt: at,
      };
    }

    return withPhase(state, "LISTEN", state.roundIndex + 1, at, "running");
  }

  if (state.phase === "LISTEN" && nextPhase === "REVEAL") {
    const resolved = resolveRoundIfNeeded(state, at);
    return withPhase(resolved, nextPhase, resolved.roundIndex, at, "running");
  }

  return withPhase(state, nextPhase, state.roundIndex, at, "running");
}

export function tickRoomState(state: RoomState, at = nowMs()): RoomState {
  if (state.lifecycle !== "running" || at < state.phaseEndsAt) {
    return state;
  }

  let next = state;
  let guard = 0;

  while (next.lifecycle === "running" && at >= next.phaseEndsAt && guard < 12) {
    next = advanceRoomPhase(next, next.phaseEndsAt);
    guard += 1;
  }

  return next;
}

function pruneStaleParticipants(roomState: RoomState, at = nowMs()) {
  const nextParticipants = roomState.participants.filter(
    (participant) => at - participant.lastSeenAt <= participantStaleMs,
  );
  const participantIds = new Set(nextParticipants.map((participant) => participant.id));
  const nextPreloadReadinessEntries = Object.entries(roomState.preloadReadiness).filter(([playerId]) =>
    participantIds.has(playerId),
  );
  const nextPreloadReadiness = Object.fromEntries(nextPreloadReadinessEntries) as Record<
    string,
    PreloadReadiness
  >;

  if (
    nextParticipants.length === roomState.participants.length &&
    nextPreloadReadinessEntries.length === Object.keys(roomState.preloadReadiness).length
  ) {
    return roomState;
  }

  return {
    ...roomState,
    participants: nextParticipants,
    preloadReadiness: nextPreloadReadiness,
    updatedAt: at,
  };
}

function upsertParticipantInState(
  roomState: RoomState,
  participant: Pick<RoomParticipant, "id" | "name">,
  at = nowMs(),
) {
  const participantId = participant.id.trim();
  if (!participantId) {
    return roomState;
  }

  const normalizedName = participant.name.trim();
  if (!normalizedName) {
    return roomState;
  }

  const existingIndex = roomState.participants.findIndex(({ id }) => id === participantId);
  if (existingIndex >= 0) {
    const existing = roomState.participants[existingIndex]!;
    const shouldSkipUpdate = existing.name === normalizedName && at - existing.lastSeenAt < 2_000;
    if (shouldSkipUpdate) {
      return roomState;
    }

    const nextParticipants = [...roomState.participants];
    nextParticipants[existingIndex] = {
      ...existing,
      name: normalizedName,
      lastSeenAt: at,
    };

    return {
      ...roomState,
      participants: nextParticipants,
      updatedAt: roomState.updatedAt,
    };
  }

  if (roomState.lifecycle === "running" && !roomState.allowedPlayerIds.includes(participantId)) {
    return roomState;
  }

  return {
    ...roomState,
    participants: [
      ...roomState.participants,
      {
        id: participantId,
        name: normalizedName,
        color: colorForParticipantIndex(roomState.participants.length),
        joinedAt: at,
        lastSeenAt: at,
      },
    ],
    allowedPlayerIds:
      roomState.lifecycle === "lobby" && !roomState.allowedPlayerIds.includes(participantId)
        ? [...roomState.allowedPlayerIds, participantId]
        : roomState.allowedPlayerIds,
    updatedAt: roomState.updatedAt,
  };
}

function removeParticipantInState(roomState: RoomState, participantId: string, at = nowMs()) {
  const nextParticipants = roomState.participants.filter(({ id }) => id !== participantId);
  if (nextParticipants.length === roomState.participants.length) {
    return roomState;
  }

  return {
    ...roomState,
    participants: nextParticipants,
    updatedAt: roomState.updatedAt,
  };
}

function guessSubmissionKey(playerId: string, roundId: string) {
  return `${playerId}:${roundId}`;
}

function timelineSubmissionKey(playerId: string, roundId: string) {
  return `${playerId}:${roundId}`;
}

function timelineEntriesForState(state: RoomState) {
  return buildTimelineEntries(state.timelineRoundIds, state.rounds);
}

function isTimelinePlacementCorrect(state: RoomState, round: RoomRound, insertIndex: number) {
  const entries = timelineEntriesForState(state);
  return isTimelineInsertCorrect(entries, round.year, insertIndex);
}

function decayedPoints(
  maxPoints: number,
  submittedAt: number | undefined,
  phaseStartedAt: number,
  phaseEndsAt: number,
) {
  if (!submittedAt) {
    return 0;
  }

  const clampedAt = Math.max(phaseStartedAt, Math.min(submittedAt, phaseEndsAt));
  const duration = Math.max(1, phaseEndsAt - phaseStartedAt);
  const ratio = 1 - (clampedAt - phaseStartedAt) / duration;
  return Math.max(0, Math.round(maxPoints * ratio));
}

function ensureScoreKeys(state: RoomState) {
  const scores = { ...state.scores };
  for (const playerId of state.allowedPlayerIds) {
    if (typeof scores[playerId] !== "number") {
      scores[playerId] = 0;
    }
  }
  return scores;
}

function resolveRoundIfNeeded(state: RoomState, at = nowMs()): RoomState {
  const round = getActiveRound(state);
  if (state.roundBreakdowns[round.id]) {
    return state;
  }

  const scores = ensureScoreKeys(state);
  const players: Record<string, RoundPlayerBreakdown> = {};

  for (const playerId of state.allowedPlayerIds) {
    const guess = state.guessSubmissions[guessSubmissionKey(playerId, round.id)];
    const timeline = state.timelineSubmissions[timelineSubmissionKey(playerId, round.id)];

    const trackCorrect = guess?.trackId === round.trackId;
    const artistCorrect = guess?.artistId === round.artistId;
    const timelineCorrect =
      typeof timeline?.insertIndex === "number"
        ? isTimelinePlacementCorrect(state, round, timeline.insertIndex)
        : false;

    const trackPoints = trackCorrect
      ? decayedPoints(scoringMaxPoints.track, guess?.submittedAt, state.phaseStartedAt, state.phaseEndsAt)
      : 0;
    const artistPoints = artistCorrect
      ? decayedPoints(scoringMaxPoints.artist, guess?.submittedAt, state.phaseStartedAt, state.phaseEndsAt)
      : 0;
    const timelinePoints = timelineCorrect
      ? decayedPoints(scoringMaxPoints.timeline, guess?.submittedAt, state.phaseStartedAt, state.phaseEndsAt)
      : 0;
    const total = trackPoints + artistPoints + timelinePoints;

    scores[playerId] = (scores[playerId] ?? 0) + total;
    players[playerId] = {
      playerId,
      guessCorrect: {
        track: trackCorrect,
        artist: artistCorrect,
      },
      timelineCorrect,
      points: {
        track: trackPoints,
        artist: artistPoints,
        timeline: timelinePoints,
        total,
      },
    };
  }

  return {
    ...state,
    scores,
    timelineRoundIds: state.timelineRoundIds.includes(round.id) ? state.timelineRoundIds : [...state.timelineRoundIds, round.id],
    roundBreakdowns: {
      ...state.roundBreakdowns,
      [round.id]: {
        roundId: round.id,
        resolvedAt: at,
        players,
      },
    },
    updatedAt: at,
  };
}

function submitGuessInState(
  roomState: RoomState,
  submission: Pick<GuessSubmission, "playerId" | "roundId" | "trackId" | "artistId">,
  at = nowMs(),
) {
  const playerId = submission.playerId.trim();
  const roundId = submission.roundId.trim();
  const trackId = submission.trackId.trim();
  const artistId = submission.artistId.trim();
  if (!playerId || !roundId || !trackId || !artistId) {
    return roomState;
  }

  const key = guessSubmissionKey(playerId, roundId);
  if (roomState.guessSubmissions[key]) {
    return roomState;
  }

  if (roomState.lifecycle === "running" && !roomState.allowedPlayerIds.includes(playerId)) {
    return roomState;
  }

  return {
    ...roomState,
    guessSubmissions: {
      ...roomState.guessSubmissions,
      [key]: {
        playerId,
        roundId,
        trackId,
        artistId,
        submittedAt: at,
      },
    },
    updatedAt: roomState.updatedAt,
  };
}

function submitTimelineInState(
  roomState: RoomState,
  submission: Pick<TimelineSubmission, "playerId" | "roundId" | "insertIndex">,
  at = nowMs(),
) {
  const playerId = submission.playerId.trim();
  const roundId = submission.roundId.trim();
  if (!playerId || !roundId || !Number.isFinite(submission.insertIndex)) {
    return roomState;
  }

  const key = timelineSubmissionKey(playerId, roundId);
  const guessKey = guessSubmissionKey(playerId, roundId);

  if (roomState.lifecycle === "running" && !roomState.allowedPlayerIds.includes(playerId)) {
    return roomState;
  }

  if (!roomState.guessSubmissions[guessKey]) {
    return roomState;
  }

  const clampedInsertIndex = clampTimelineInsertIndex(
    submission.insertIndex,
    timelineEntriesForState(roomState).length,
  );

  return {
    ...roomState,
    timelineSubmissions: {
      ...roomState.timelineSubmissions,
      [key]: {
        playerId,
        roundId,
        insertIndex: clampedInsertIndex,
        submittedAt: roomState.timelineSubmissions[key]?.submittedAt ?? at,
      },
    },
    updatedAt: roomState.updatedAt,
  };
}

function updatePreloadReadinessInState(
  roomState: RoomState,
  readiness: Pick<
    PreloadReadiness,
    "playerId" | "gamePackLoaded" | "autocompleteLoaded" | "gamePackHash"
  >,
  at = nowMs(),
) {
  const playerId = readiness.playerId.trim();
  if (!playerId) {
    return roomState;
  }

  const nextReadiness: PreloadReadiness = {
    playerId,
    gamePackLoaded: Boolean(readiness.gamePackLoaded),
    autocompleteLoaded: Boolean(readiness.autocompleteLoaded),
    gamePackHash: readiness.gamePackHash.trim(),
    updatedAt: at,
  };

  const existing = roomState.preloadReadiness[playerId];
  if (
    existing &&
    existing.gamePackLoaded === nextReadiness.gamePackLoaded &&
    existing.autocompleteLoaded === nextReadiness.autocompleteLoaded &&
    existing.gamePackHash === nextReadiness.gamePackHash
  ) {
    return roomState;
  }

  return {
    ...roomState,
    preloadReadiness: {
      ...roomState.preloadReadiness,
      [playerId]: nextReadiness,
    },
    updatedAt: roomState.updatedAt,
  };
}

function updatePlaylistIdsInState(roomState: RoomState, playlistIds: string[]) {
  const sanitized = [
    ...new Set(
      playlistIds
        .map((playlistId) => playlistId.trim())
        .filter((playlistId) => playlistId.length > 0),
    ),
  ];
  const nextPlaylistIds = sanitized.length > 0 ? sanitized : [...defaultPlaylistIds];
  if (nextPlaylistIds.join(",") === roomState.playlistIds.join(",")) {
    return roomState;
  }

  return {
    ...roomState,
    playlistIds: nextPlaylistIds,
    preloadReadiness: {},
    updatedAt: roomState.updatedAt,
  };
}

function getActiveRound(state: RoomState) {
  const rounds = state.rounds.length > 0 ? state.rounds : fallbackRounds();
  return rounds[Math.min(state.roundIndex, rounds.length - 1)]!;
}

export function useRoomState(roomId: string, role: RoomRole): RoomHookResult {
  const [state, setState] = useState<RoomState>(() => createLobbyState(roomId));
  const [now, setNow] = useState<number>(() => nowMs());
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const sendStateToServer = useCallback((nextState: RoomState) => {
    void postRoomCommand(roomId, { type: "replace_state", state: nextState }).catch(() => {
      // Best-effort sync in dev mode.
    });
  }, [roomId]);

  const syncRemoteIfNewer = useCallback((remoteState: RoomState) => {
    setState((current) => (shouldApplyRemoteState(current, remoteState) ? remoteState : current));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const remote = await fetchRoomStateFromServer(roomId);
        if (!cancelled) {
          setState(remote);
        }
      } catch {
        if (!cancelled && role === "host") {
          const fallback = createLobbyState(roomId);
          setState(fallback);
          sendStateToServer(fallback);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [role, roomId, sendStateToServer]);

  useEffect(() => {
    let disposed = false;
    let fallbackInterval: number | null = null;
    let eventSource: EventSource | null = null;

    const poll = async () => {
      try {
        const remote = await fetchRoomStateFromServer(roomId);
        syncRemoteIfNewer(remote);
      } catch {
        // Ignore transient polling failures.
      }
    };

    const startFallbackPolling = () => {
      if (fallbackInterval !== null) {
        return;
      }

      fallbackInterval = window.setInterval(() => {
        void poll();
      }, 1_000);
      void poll();
    };

    if (typeof window === "undefined" || !("EventSource" in window)) {
      startFallbackPolling();
      return () => {
        if (fallbackInterval !== null) {
          window.clearInterval(fallbackInterval);
          fallbackInterval = null;
        }
      };
    }

    // Keep polling active even with SSE as a safety net for buffered/proxy-delayed streams.
    startFallbackPolling();
    eventSource = new EventSource(apiRoomEventsPath(roomId));

    eventSource.addEventListener("room_state", (event) => {
      if (disposed) {
        return;
      }

      try {
        const remote = normalizeRoomState(JSON.parse((event as MessageEvent<string>).data) as RoomState);
        syncRemoteIfNewer(remote);
      } catch {
        // Ignore malformed events.
      }
    });

    eventSource.onerror = () => {
      if (!disposed) {
        void poll();
      }
    };

    return () => {
      disposed = true;
      if (fallbackInterval !== null) {
        window.clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [roomId, syncRemoteIfNewer]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(nowMs());
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (role !== "host") {
      return;
    }

    const tickTimer = window.setInterval(() => {
      setState((prevState) => {
        const at = nowMs();
        const phaseState = tickRoomState(prevState, at);
        const nextState = pruneStaleParticipants(phaseState, at);
        if (nextState !== prevState) {
          sendStateToServer(nextState);
        }
        return nextState;
      });
    }, 250);

    return () => {
      window.clearInterval(tickTimer);
    };
  }, [role, sendStateToServer]);

  const controls = useMemo(
    () => ({
      startGame: () => {
        if (role !== "host") {
          return;
        }

        setState((prevState) => {
          const nextState = startRoomGame(prevState);
          sendStateToServer(nextState);
          return nextState;
        });
      },
      skipPhase: () => {
        if (role !== "host") {
          return;
        }

        setState((prevState) => {
          const nextState = advanceRoomPhase(prevState);
          if (nextState !== prevState) {
            sendStateToServer(nextState);
          }
          return nextState;
        });
      },
      resetLobby: () => {
        if (role !== "host") {
          return;
        }

        const nextState = createLobbyState(roomId);
        setState(nextState);
        sendStateToServer(nextState);
      },
      syncState: () => {
        if (role !== "host") {
          return;
        }

        sendStateToServer(stateRef.current);
      },
      upsertParticipant: (participant: Pick<RoomParticipant, "id" | "name">) => {
        setState((prevState) => {
          const nextState = upsertParticipantInState(prevState, participant);
          if (nextState !== prevState) {
            void postRoomCommand(roomId, {
              type: "upsert_participant",
              participant,
            })
              .then((remote) => {
                syncRemoteIfNewer(remote);
              })
              .catch(() => {
                // Best-effort in local dev.
              });
          }
          return nextState;
        });
      },
      removeParticipant: (participantId: string) => {
        setState((prevState) => {
          const nextState = removeParticipantInState(prevState, participantId);
          if (nextState !== prevState) {
            void postRoomCommand(roomId, {
              type: "remove_participant",
              participantId,
            })
              .then((remote) => {
                syncRemoteIfNewer(remote);
              })
              .catch(() => {
                // Best-effort in local dev.
              });
          }
          return nextState;
        });
      },
      submitGuess: (submission: Pick<GuessSubmission, "playerId" | "roundId" | "trackId" | "artistId">) => {
        setState((prevState) => {
          const nextState = submitGuessInState(prevState, submission);
          if (nextState !== prevState) {
            void postRoomCommand(roomId, {
              type: "submit_guess",
              submission,
            })
              .then((remote) => {
                syncRemoteIfNewer(remote);
              })
              .catch(() => {
                // Best-effort in local dev.
              });
          }
          return nextState;
        });
      },
      submitTimeline: (submission: Pick<TimelineSubmission, "playerId" | "roundId" | "insertIndex">) => {
        setState((prevState) => {
          const nextState = submitTimelineInState(prevState, submission);
          if (nextState !== prevState) {
            void postRoomCommand(roomId, {
              type: "submit_timeline",
              submission,
            })
              .then((remote) => {
                syncRemoteIfNewer(remote);
              })
              .catch(() => {
                // Best-effort in local dev.
              });
          }
          return nextState;
        });
      },
      updatePreload: (
        readiness: Pick<
          PreloadReadiness,
          "playerId" | "gamePackLoaded" | "autocompleteLoaded" | "gamePackHash"
        >,
      ) => {
        setState((prevState) => updatePreloadReadinessInState(prevState, readiness));
        void postRoomCommand(roomId, {
          type: "update_preload",
          readiness,
        })
          .then((remote) => {
            syncRemoteIfNewer(remote);
          })
          .catch(() => {
            // Best-effort in local dev.
          });
      },
      updatePlaylistIds: (playlistIds: string[]) => {
        if (role !== "host") {
          return;
        }

        setState((prevState) => {
          const nextState = updatePlaylistIdsInState(prevState, playlistIds);
          if (nextState !== prevState) {
            void postRoomCommand(roomId, {
              type: "update_playlist_ids",
              playlistIds,
            })
              .then((remote) => {
                syncRemoteIfNewer(remote);
              })
              .catch(() => {
                // Best-effort in local dev.
              });
          }
          return nextState;
        });
      },
    }),
    [role, roomId, sendStateToServer, syncRemoteIfNewer],
  );

  const round = getActiveRound(state);
  const remainingMs = state.lifecycle === "running" ? Math.max(0, state.phaseEndsAt - now) : 0;

  return {
    state,
    now,
    round,
    remainingMs,
    controls,
  };
}

export function phaseLabel(phase: GamePhase) {
  return phase.charAt(0) + phase.slice(1).toLowerCase();
}

export const phaseDurations = phaseDurationsMs;
