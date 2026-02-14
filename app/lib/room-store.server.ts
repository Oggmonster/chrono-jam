import {
  defaultPlaylistIds as defaultPackPlaylistIds,
  loadRoundsForPlaylistIds,
  type PlaylistRound,
} from "~/lib/playlist-rounds.server";
import {
  clampGameSongCount,
  defaultGameSongCount,
  parseGameSongCount,
} from "~/lib/game-settings";
import { buildTimelineEntries, clampTimelineInsertIndex } from "~/lib/timeline";

const defaultRoomPlaylistIds = [...defaultPackPlaylistIds];

type GamePhase = "LISTEN" | "REVEAL" | "INTERMISSION";
type RoomLifecycle = "lobby" | "running" | "finished";

type StoredParticipant = {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  lastSeenAt: number;
};

type StoredGuessSubmission = {
  playerId: string;
  roundId: string;
  trackId: string;
  artistId: string;
  submittedAt: number;
};

type StoredTimelineSubmission = {
  playerId: string;
  roundId: string;
  insertIndex: number;
  submittedAt: number;
};

type StoredPreloadReadiness = {
  playerId: string;
  gamePackLoaded: boolean;
  autocompleteLoaded: boolean;
  gamePackHash: string;
  updatedAt: number;
};

type StoredRoundPlayerBreakdown = {
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

type StoredRoundBreakdown = {
  roundId: string;
  resolvedAt: number;
  players: Record<string, StoredRoundPlayerBreakdown>;
};

export type StoredRoomState = {
  roomId: string;
  lifecycle: RoomLifecycle;
  phase: GamePhase;
  roundIndex: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  updatedAt: number;
  participants: StoredParticipant[];
  allowedPlayerIds: string[];
  guessSubmissions: Record<string, StoredGuessSubmission>;
  timelineSubmissions: Record<string, StoredTimelineSubmission>;
  preloadReadiness: Record<string, StoredPreloadReadiness>;
  playlistIds: string[];
  gameSongCount: number;
  rounds: PlaylistRound[];
  timelineRoundIds: string[];
  scores: Record<string, number>;
  roundBreakdowns: Record<string, StoredRoundBreakdown>;
};

const participantColors = ["#4ec7e0", "#f28d35", "#e45395", "#7bcf4b", "#7d6cfc", "#ff7f5c"];
const participantStaleMs = 20_000;

type Store = Map<string, StoredRoomState>;
type RoomStateListener = (state: StoredRoomState) => void;
type RoomSubscribers = Map<string, Set<RoomStateListener>>;

declare global {
  var __chronojamRoomStore: Store | undefined;
  var __chronojamRoomSubscribers: RoomSubscribers | undefined;
}

function nowMs() {
  return Date.now();
}

function roomStore(): Store {
  if (!globalThis.__chronojamRoomStore) {
    globalThis.__chronojamRoomStore = new Map<string, StoredRoomState>();
  }
  return globalThis.__chronojamRoomStore;
}

function roomSubscribers(): RoomSubscribers {
  if (!globalThis.__chronojamRoomSubscribers) {
    globalThis.__chronojamRoomSubscribers = new Map<string, Set<RoomStateListener>>();
  }
  return globalThis.__chronojamRoomSubscribers;
}

function notifyRoomSubscribers(roomId: string, state: StoredRoomState) {
  const listeners = roomSubscribers().get(roomId);
  if (!listeners || listeners.size === 0) {
    return;
  }

  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // Never let a subscriber failure break room updates.
    }
  }
}

function setStoredRoomState(
  roomId: string,
  state: StoredRoomState,
  options: { notify?: boolean } = {},
): StoredRoomState {
  const { notify = true } = options;
  const store = roomStore();
  const previous = store.get(roomId);
  if (previous === state) {
    return state;
  }

  store.set(roomId, state);
  if (notify) {
    notifyRoomSubscribers(roomId, state);
  }
  return state;
}

function colorForParticipantIndex(index: number) {
  return participantColors[index % participantColors.length]!;
}

function randomSampleRounds(rounds: PlaylistRound[], count: number) {
  if (rounds.length <= count) {
    return [...rounds];
  }

  const shuffled = [...rounds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current;
  }

  return shuffled.slice(0, count);
}

function buildRoomRounds(
  playlistIds: string[],
  requestedSongCount: number | null | undefined,
  options: { preferredRoundIds?: string[] } = {},
) {
  const availableRounds = loadRoundsForPlaylistIds(playlistIds);
  const gameSongCount = clampGameSongCount(requestedSongCount, availableRounds.length, defaultGameSongCount);
  const preferredRoundIds = options.preferredRoundIds ?? [];

  if (preferredRoundIds.length === 0) {
    return {
      gameSongCount,
      rounds: randomSampleRounds(availableRounds, gameSongCount),
    };
  }

  const byRoundId = new Map(availableRounds.map((round) => [round.id, round] as const));
  const selectedRoundIds = new Set<string>();
  const preferredRounds: PlaylistRound[] = [];
  for (const rawRoundId of preferredRoundIds) {
    const roundId = rawRoundId.trim();
    if (!roundId || selectedRoundIds.has(roundId)) {
      continue;
    }

    const round = byRoundId.get(roundId);
    if (!round) {
      continue;
    }

    selectedRoundIds.add(round.id);
    preferredRounds.push(round);
    if (preferredRounds.length >= gameSongCount) {
      break;
    }
  }

  if (preferredRounds.length >= gameSongCount) {
    return {
      gameSongCount,
      rounds: preferredRounds.slice(0, gameSongCount),
    };
  }

  const remainingRounds = availableRounds.filter((round) => !selectedRoundIds.has(round.id));
  const randomRemainder = randomSampleRounds(remainingRounds, gameSongCount - preferredRounds.length);
  return {
    gameSongCount,
    rounds: [...preferredRounds, ...randomRemainder],
  };
}

export function createStoredRoomState(roomId: string, at = nowMs()): StoredRoomState {
  const playlistIds = [...defaultRoomPlaylistIds];
  const { rounds, gameSongCount } = buildRoomRounds(playlistIds, defaultGameSongCount);
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
    playlistIds,
    gameSongCount,
    rounds,
    timelineRoundIds: [],
    scores: {},
    roundBreakdowns: {},
  };
}

function sanitizeState(roomId: string, incoming: unknown): StoredRoomState {
  if (typeof incoming !== "object" || incoming === null) {
    return createStoredRoomState(roomId);
  }

  const state = incoming as Partial<StoredRoomState>;
  const at = nowMs();
  const lifecycle: RoomLifecycle =
    state.lifecycle === "running" || state.lifecycle === "finished" ? state.lifecycle : "lobby";
  const phase: GamePhase = state.phase === "REVEAL" || state.phase === "INTERMISSION" ? state.phase : "LISTEN";

  const participants = Array.isArray(state.participants)
    ? state.participants
        .filter(
          (participant): participant is StoredParticipant =>
            typeof participant.id === "string" &&
            typeof participant.name === "string" &&
            typeof participant.color === "string" &&
            typeof participant.joinedAt === "number",
        )
        .map((participant) => ({
          ...participant,
          lastSeenAt: typeof participant.lastSeenAt === "number" ? participant.lastSeenAt : participant.joinedAt,
        }))
    : [];

  const allowedPlayerIds = Array.isArray(state.allowedPlayerIds)
    ? [
        ...new Set(
          state.allowedPlayerIds.filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0,
          ),
        ),
      ]
    : [];

  const guessSubmissionsEntries = state.guessSubmissions;
  const guessSubmissions: Record<string, StoredGuessSubmission> = {};
  if (guessSubmissionsEntries && typeof guessSubmissionsEntries === "object") {
    for (const [key, value] of Object.entries(guessSubmissionsEntries)) {
      if (
        typeof value === "object" &&
        value !== null &&
        typeof value.playerId === "string" &&
        typeof value.roundId === "string" &&
        typeof value.trackId === "string" &&
        typeof value.artistId === "string" &&
        typeof value.submittedAt === "number"
      ) {
        guessSubmissions[key] = {
          playerId: value.playerId,
          roundId: value.roundId,
          trackId: value.trackId,
          artistId: value.artistId,
          submittedAt: value.submittedAt,
        };
      }
    }
  }

  const timelineSubmissionsEntries = state.timelineSubmissions;
  const timelineSubmissions: Record<string, StoredTimelineSubmission> = {};
  if (timelineSubmissionsEntries && typeof timelineSubmissionsEntries === "object") {
    for (const [key, value] of Object.entries(timelineSubmissionsEntries)) {
      if (
        typeof value === "object" &&
        value !== null &&
        typeof value.playerId === "string" &&
        typeof value.roundId === "string" &&
        typeof value.insertIndex === "number" &&
        typeof value.submittedAt === "number"
      ) {
        timelineSubmissions[key] = {
          playerId: value.playerId,
          roundId: value.roundId,
          insertIndex: value.insertIndex,
          submittedAt: value.submittedAt,
        };
      }
    }
  }

  const preloadReadinessEntries = state.preloadReadiness;
  const preloadReadiness: Record<string, StoredPreloadReadiness> = {};
  if (preloadReadinessEntries && typeof preloadReadinessEntries === "object") {
    for (const [key, value] of Object.entries(preloadReadinessEntries)) {
      if (
        typeof value === "object" &&
        value !== null &&
        typeof value.playerId === "string" &&
        typeof value.gamePackLoaded === "boolean" &&
        typeof value.autocompleteLoaded === "boolean"
      ) {
        preloadReadiness[key] = {
          playerId: value.playerId,
          gamePackLoaded: value.gamePackLoaded,
          autocompleteLoaded: value.autocompleteLoaded,
          gamePackHash: typeof value.gamePackHash === "string" ? value.gamePackHash : "",
          updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : at,
        };
      }
    }
  }

  const playlistIds = Array.isArray(state.playlistIds)
    ? [
        ...new Set(
          state.playlistIds
            .filter((playlistId): playlistId is string => typeof playlistId === "string")
            .map((playlistId) => playlistId.trim())
            .filter((playlistId) => playlistId.length > 0),
        ),
      ]
    : [...defaultRoomPlaylistIds];
  const requestedGameSongCount =
    parseGameSongCount((state as { gameSongCount?: unknown }).gameSongCount) ??
    (Array.isArray(state.rounds) ? parseGameSongCount(state.rounds.length) : null) ??
    defaultGameSongCount;
  const preferredRoundIds = Array.isArray(state.rounds)
    ? state.rounds
        .map((round) => (typeof round?.id === "string" ? round.id.trim() : ""))
        .filter((roundId) => roundId.length > 0)
    : [];
  const { rounds, gameSongCount } = buildRoomRounds(playlistIds, requestedGameSongCount, {
    preferredRoundIds,
  });
  const roundIdSet = new Set(rounds.map((round) => round.id));

  const timelineRoundIds = Array.isArray(state.timelineRoundIds)
    ? state.timelineRoundIds.filter(
        (roundId): roundId is string =>
          typeof roundId === "string" && roundId.length > 0 && roundIdSet.has(roundId),
      )
    : [];

  const scoresEntries = state.scores;
  const scores: Record<string, number> = {};
  if (scoresEntries && typeof scoresEntries === "object") {
    for (const [playerId, points] of Object.entries(scoresEntries)) {
      if (typeof points === "number" && Number.isFinite(points)) {
        scores[playerId] = points;
      }
    }
  }

  const roundBreakdownsEntries = state.roundBreakdowns;
  const roundBreakdowns: Record<string, StoredRoundBreakdown> = {};
  if (roundBreakdownsEntries && typeof roundBreakdownsEntries === "object") {
    for (const [roundId, rawBreakdown] of Object.entries(roundBreakdownsEntries)) {
      if (
        typeof rawBreakdown !== "object" ||
        rawBreakdown === null ||
        typeof rawBreakdown.roundId !== "string" ||
        typeof rawBreakdown.resolvedAt !== "number" ||
        typeof rawBreakdown.players !== "object" ||
        rawBreakdown.players === null
      ) {
        continue;
      }

      const players: Record<string, StoredRoundPlayerBreakdown> = {};
      for (const [playerId, rawPlayerBreakdown] of Object.entries(rawBreakdown.players)) {
        if (
          typeof rawPlayerBreakdown !== "object" ||
          rawPlayerBreakdown === null ||
          typeof rawPlayerBreakdown.playerId !== "string" ||
          typeof rawPlayerBreakdown.guessCorrect !== "object" ||
          rawPlayerBreakdown.guessCorrect === null ||
          typeof rawPlayerBreakdown.guessCorrect.track !== "boolean" ||
          typeof rawPlayerBreakdown.guessCorrect.artist !== "boolean" ||
          typeof rawPlayerBreakdown.timelineCorrect !== "boolean" ||
          typeof rawPlayerBreakdown.points !== "object" ||
          rawPlayerBreakdown.points === null ||
          typeof rawPlayerBreakdown.points.track !== "number" ||
          typeof rawPlayerBreakdown.points.artist !== "number" ||
          typeof rawPlayerBreakdown.points.timeline !== "number" ||
          typeof rawPlayerBreakdown.points.total !== "number"
        ) {
          continue;
        }

        players[playerId] = {
          playerId: rawPlayerBreakdown.playerId,
          guessCorrect: {
            track: rawPlayerBreakdown.guessCorrect.track,
            artist: rawPlayerBreakdown.guessCorrect.artist,
          },
          timelineCorrect: rawPlayerBreakdown.timelineCorrect,
          points: {
            track: rawPlayerBreakdown.points.track,
            artist: rawPlayerBreakdown.points.artist,
            timeline: rawPlayerBreakdown.points.timeline,
            total: rawPlayerBreakdown.points.total,
          },
        };
      }

      roundBreakdowns[roundId] = {
        roundId: rawBreakdown.roundId,
        resolvedAt: rawBreakdown.resolvedAt,
        players,
      };
    }
  }

  const parsedRoundIndex = Number.isFinite(Number(state.roundIndex)) ? Math.floor(Number(state.roundIndex)) : 0;
  const maxRoundIndex = Math.max(0, rounds.length - 1);

  return {
    roomId,
    lifecycle,
    phase,
    roundIndex: Math.max(0, Math.min(maxRoundIndex, parsedRoundIndex)),
    phaseStartedAt: Number(state.phaseStartedAt ?? at),
    phaseEndsAt: Number(state.phaseEndsAt ?? at),
    updatedAt: Number(state.updatedAt ?? at),
    participants,
    allowedPlayerIds,
    guessSubmissions,
    timelineSubmissions,
    preloadReadiness,
    playlistIds: playlistIds.length > 0 ? playlistIds : [...defaultRoomPlaylistIds],
    gameSongCount,
    rounds,
    timelineRoundIds,
    scores,
    roundBreakdowns,
  };
}

function pruneStaleParticipants(roomState: StoredRoomState, at = nowMs()): StoredRoomState {
  const nextParticipants = roomState.participants.filter(
    (participant) => at - participant.lastSeenAt <= participantStaleMs,
  );
  const participantIds = new Set(nextParticipants.map((participant) => participant.id));
  const nextPreloadReadinessEntries = Object.entries(roomState.preloadReadiness).filter(([playerId]) =>
    participantIds.has(playerId),
  );
  const nextPreloadReadiness = Object.fromEntries(nextPreloadReadinessEntries) as Record<
    string,
    StoredPreloadReadiness
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

function ensureRoomState(roomId: string, options: { notifyOnPrune?: boolean } = {}): StoredRoomState {
  const { notifyOnPrune = true } = options;
  const store = roomStore();
  const existing = store.get(roomId);
  if (!existing) {
    const created = createStoredRoomState(roomId);
    store.set(roomId, created);
    return created;
  }

  if (!existing.guessSubmissions || typeof existing.guessSubmissions !== "object") {
    const patched = {
      ...existing,
      guessSubmissions: {},
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (!existing.timelineSubmissions || typeof existing.timelineSubmissions !== "object") {
    const patched = {
      ...existing,
      timelineSubmissions: {},
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (!existing.preloadReadiness || typeof existing.preloadReadiness !== "object") {
    const patched = {
      ...existing,
      preloadReadiness: {},
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (!Array.isArray(existing.playlistIds) || existing.playlistIds.length === 0) {
    const playlistIds = [...defaultRoomPlaylistIds];
    const { rounds, gameSongCount } = buildRoomRounds(
      playlistIds,
      parseGameSongCount((existing as { gameSongCount?: unknown }).gameSongCount) ?? defaultGameSongCount,
    );
    const patched = {
      ...existing,
      playlistIds,
      gameSongCount,
      rounds,
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (parseGameSongCount((existing as { gameSongCount?: unknown }).gameSongCount) === null) {
    const { rounds, gameSongCount } = buildRoomRounds(
      existing.playlistIds,
      Array.isArray(existing.rounds) && existing.rounds.length > 0
        ? existing.rounds.length
        : defaultGameSongCount,
      {
        preferredRoundIds:
          Array.isArray(existing.rounds) && existing.rounds.length > 0
            ? existing.rounds
                .map((round) => (typeof round?.id === "string" ? round.id.trim() : ""))
                .filter((roundId) => roundId.length > 0)
            : [],
      },
    );

    const patched = {
      ...existing,
      gameSongCount,
      rounds,
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (!Array.isArray(existing.rounds) || existing.rounds.length === 0 || existing.rounds.length !== existing.gameSongCount) {
    const { rounds, gameSongCount } = buildRoomRounds(existing.playlistIds, existing.gameSongCount, {
      preferredRoundIds:
        Array.isArray(existing.rounds) && existing.rounds.length > 0
          ? existing.rounds
              .map((round) => (typeof round?.id === "string" ? round.id.trim() : ""))
              .filter((roundId) => roundId.length > 0)
          : [],
    });
    const patched = {
      ...existing,
      gameSongCount,
      rounds,
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  const maxRoundIndex = Math.max(0, existing.rounds.length - 1);
  if (existing.roundIndex > maxRoundIndex) {
    const patched = {
      ...existing,
      roundIndex: maxRoundIndex,
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (!Array.isArray(existing.timelineRoundIds)) {
    const patched = {
      ...existing,
      timelineRoundIds: [],
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (!existing.scores || typeof existing.scores !== "object") {
    const patched = {
      ...existing,
      scores: {},
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (!existing.roundBreakdowns || typeof existing.roundBreakdowns !== "object") {
    const patched = {
      ...existing,
      roundBreakdowns: {},
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (!Array.isArray(existing.allowedPlayerIds)) {
    const patched = {
      ...existing,
      allowedPlayerIds: existing.participants.map((participant) => participant.id),
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  if (existing.phase !== "LISTEN" && existing.phase !== "REVEAL" && existing.phase !== "INTERMISSION") {
    const patched = {
      ...existing,
      phase: "LISTEN" as GamePhase,
      updatedAt: nowMs(),
    };
    return setStoredRoomState(roomId, patched, { notify: false });
  }

  const next = pruneStaleParticipants(existing);
  if (next !== existing) {
    return setStoredRoomState(roomId, next, { notify: notifyOnPrune });
  }

  return existing;
}

export function getRoomState(roomId: string): StoredRoomState {
  return ensureRoomState(roomId);
}

export function replaceRoomState(roomId: string, incoming: unknown): StoredRoomState {
  const sanitized = sanitizeState(roomId, incoming);
  const next = pruneStaleParticipants(sanitized);
  return setStoredRoomState(roomId, next);
}

export function upsertParticipant(roomId: string, participant: { id: string; name: string }): StoredRoomState {
  const base = ensureRoomState(roomId, { notifyOnPrune: false });
  const participantId = participant.id.trim();
  if (!participantId) {
    return base;
  }

  const normalizedName = participant.name.trim();
  if (!normalizedName) {
    return base;
  }

  const at = nowMs();
  const existingIndex = base.participants.findIndex(({ id }) => id === participantId);
  if (existingIndex >= 0) {
    const existing = base.participants[existingIndex]!;
    const shouldSkipUpdate = existing.name === normalizedName && at - existing.lastSeenAt < 2_000;
    if (shouldSkipUpdate) {
      return base;
    }

    const nextParticipants = [...base.participants];
    nextParticipants[existingIndex] = {
      ...existing,
      name: normalizedName,
      lastSeenAt: at,
    };

    const nextState = {
      ...base,
      participants: nextParticipants,
      updatedAt: at,
    };
    return setStoredRoomState(roomId, nextState);
  }

  if (base.lifecycle === "running" && !base.allowedPlayerIds.includes(participantId)) {
    return base;
  }

  const nextState = {
    ...base,
    participants: [
      ...base.participants,
      {
        id: participantId,
        name: normalizedName,
        color: colorForParticipantIndex(base.participants.length),
        joinedAt: at,
        lastSeenAt: at,
      },
    ],
    allowedPlayerIds:
      base.lifecycle === "lobby" && !base.allowedPlayerIds.includes(participantId)
        ? [...base.allowedPlayerIds, participantId]
        : base.allowedPlayerIds,
    updatedAt: at,
  };
  return setStoredRoomState(roomId, nextState);
}

export function removeParticipant(roomId: string, participantId: string): StoredRoomState {
  const base = ensureRoomState(roomId, { notifyOnPrune: false });
  const nextParticipants = base.participants.filter((participant) => participant.id !== participantId);
  if (nextParticipants.length === base.participants.length) {
    return base;
  }

  const nextState = {
    ...base,
    participants: nextParticipants,
    updatedAt: nowMs(),
  };
  return setStoredRoomState(roomId, nextState);
}

function guessSubmissionKey(playerId: string, roundId: string) {
  return `${playerId}:${roundId}`;
}

function timelineSubmissionKey(playerId: string, roundId: string) {
  return `${playerId}:${roundId}`;
}

export function upsertGuessSubmission(
  roomId: string,
  submission: Pick<StoredGuessSubmission, "playerId" | "roundId" | "trackId" | "artistId">,
): StoredRoomState {
  const base = ensureRoomState(roomId, { notifyOnPrune: false });
  const playerId = submission.playerId.trim();
  const roundId = submission.roundId.trim();
  const trackId = submission.trackId.trim();
  const artistId = submission.artistId.trim();
  if (!playerId || !roundId || !trackId || !artistId) {
    return base;
  }

  const key = guessSubmissionKey(playerId, roundId);
  if (base.guessSubmissions[key]) {
    return base;
  }

  if (base.lifecycle === "running" && !base.allowedPlayerIds.includes(playerId)) {
    return base;
  }

  const nextState = {
    ...base,
    guessSubmissions: {
      ...base.guessSubmissions,
      [key]: {
        playerId,
        roundId,
        trackId,
        artistId,
        submittedAt: nowMs(),
      },
    },
    updatedAt: nowMs(),
  };

  return setStoredRoomState(roomId, nextState);
}

export function upsertTimelineSubmission(
  roomId: string,
  submission: Pick<StoredTimelineSubmission, "playerId" | "roundId" | "insertIndex">,
): StoredRoomState {
  const base = ensureRoomState(roomId, { notifyOnPrune: false });
  const playerId = submission.playerId.trim();
  const roundId = submission.roundId.trim();
  if (!playerId || !roundId || !Number.isFinite(submission.insertIndex)) {
    return base;
  }

  const key = timelineSubmissionKey(playerId, roundId);
  const guessKey = guessSubmissionKey(playerId, roundId);

  if (base.lifecycle === "running" && !base.allowedPlayerIds.includes(playerId)) {
    return base;
  }

  if (!base.guessSubmissions[guessKey]) {
    return base;
  }

  const nextState = {
    ...base,
    timelineSubmissions: {
      ...base.timelineSubmissions,
      [key]: {
        playerId,
        roundId,
        insertIndex: clampTimelineInsertIndex(
          submission.insertIndex,
          buildTimelineEntries(base.timelineRoundIds, base.rounds).length,
        ),
        submittedAt: base.timelineSubmissions[key]?.submittedAt ?? nowMs(),
      },
    },
    updatedAt: nowMs(),
  };

  return setStoredRoomState(roomId, nextState);
}

export function upsertPreloadReadiness(
  roomId: string,
  readiness: Pick<
    StoredPreloadReadiness,
    "playerId" | "gamePackLoaded" | "autocompleteLoaded" | "gamePackHash"
  >,
): StoredRoomState {
  const base = ensureRoomState(roomId, { notifyOnPrune: false });
  const playerId = readiness.playerId.trim();
  if (!playerId) {
    return base;
  }

  if (base.lifecycle === "running" && !base.allowedPlayerIds.includes(playerId)) {
    return base;
  }

  const nextReadiness: StoredPreloadReadiness = {
    playerId,
    gamePackLoaded: Boolean(readiness.gamePackLoaded),
    autocompleteLoaded: Boolean(readiness.autocompleteLoaded),
    gamePackHash: readiness.gamePackHash.trim(),
    updatedAt: nowMs(),
  };

  const existing = base.preloadReadiness[playerId];
  if (
    existing &&
    existing.gamePackLoaded === nextReadiness.gamePackLoaded &&
    existing.autocompleteLoaded === nextReadiness.autocompleteLoaded &&
    existing.gamePackHash === nextReadiness.gamePackHash
  ) {
    return base;
  }

  const nextState = {
    ...base,
    preloadReadiness: {
      ...base.preloadReadiness,
      [playerId]: nextReadiness,
    },
    updatedAt: nowMs(),
  };

  return setStoredRoomState(roomId, nextState);
}

export function updateRoomPlaylistIds(roomId: string, playlistIds: string[]): StoredRoomState {
  const base = ensureRoomState(roomId, { notifyOnPrune: false });
  if (base.lifecycle !== "lobby") {
    return base;
  }

  const sanitized = [
    ...new Set(
      playlistIds
        .filter((playlistId): playlistId is string => typeof playlistId === "string")
        .map((playlistId) => playlistId.trim())
        .filter((playlistId) => playlistId.length > 0),
    ),
  ];

  const nextPlaylistIds = sanitized.length > 0 ? sanitized : [...defaultRoomPlaylistIds];
  if (nextPlaylistIds.join(",") === base.playlistIds.join(",")) {
    return base;
  }
  const at = nowMs();
  const { rounds, gameSongCount } = buildRoomRounds(nextPlaylistIds, base.gameSongCount, {
    preferredRoundIds: [],
  });

  const nextState = {
    ...base,
    phase: "LISTEN" as const,
    roundIndex: 0,
    phaseStartedAt: at,
    phaseEndsAt: at,
    guessSubmissions: {},
    timelineSubmissions: {},
    playlistIds: nextPlaylistIds,
    gameSongCount,
    rounds,
    preloadReadiness: {},
    timelineRoundIds: [],
    scores: {},
    roundBreakdowns: {},
    updatedAt: at,
  };

  return setStoredRoomState(roomId, nextState);
}

export function updateRoomGameSongCount(roomId: string, songCount: number): StoredRoomState {
  const base = ensureRoomState(roomId, { notifyOnPrune: false });
  if (base.lifecycle !== "lobby") {
    return base;
  }

  const requestedSongCount = parseGameSongCount(songCount);
  if (requestedSongCount === null) {
    return base;
  }
  if (requestedSongCount === base.gameSongCount) {
    return base;
  }

  const { rounds, gameSongCount } = buildRoomRounds(base.playlistIds, requestedSongCount, {
    preferredRoundIds: [],
  });

  const at = nowMs();
  const nextState = {
    ...base,
    phase: "LISTEN" as const,
    roundIndex: 0,
    phaseStartedAt: at,
    phaseEndsAt: at,
    guessSubmissions: {},
    timelineSubmissions: {},
    gameSongCount,
    rounds,
    timelineRoundIds: [],
    scores: {},
    roundBreakdowns: {},
    updatedAt: at,
  };

  return setStoredRoomState(roomId, nextState);
}

export function applyRoomLobbySetup(
  roomId: string,
  setup: { playlistIds: string[]; songCount: number },
): StoredRoomState {
  const base = ensureRoomState(roomId, { notifyOnPrune: false });
  const sanitizedPlaylistIds = [
    ...new Set(
      setup.playlistIds
        .filter((playlistId): playlistId is string => typeof playlistId === "string")
        .map((playlistId) => playlistId.trim())
        .filter((playlistId) => playlistId.length > 0),
    ),
  ];
  const nextPlaylistIds = sanitizedPlaylistIds.length > 0 ? sanitizedPlaylistIds : [...defaultRoomPlaylistIds];
  const requestedSongCount = parseGameSongCount(setup.songCount) ?? base.gameSongCount;
  const { rounds, gameSongCount } = buildRoomRounds(nextPlaylistIds, requestedSongCount, {
    preferredRoundIds: [],
  });

  const at = nowMs();
  const nextState: StoredRoomState = {
    ...base,
    lifecycle: "lobby",
    phase: "LISTEN",
    roundIndex: 0,
    phaseStartedAt: at,
    phaseEndsAt: at,
    guessSubmissions: {},
    timelineSubmissions: {},
    preloadReadiness: {},
    playlistIds: nextPlaylistIds,
    gameSongCount,
    rounds,
    timelineRoundIds: [],
    scores: {},
    roundBreakdowns: {},
    updatedAt: at,
  };

  return setStoredRoomState(roomId, nextState);
}

export function subscribeToRoomState(roomId: string, listener: RoomStateListener) {
  const subscribers = roomSubscribers();
  const listeners = subscribers.get(roomId) ?? new Set<RoomStateListener>();
  listeners.add(listener);
  subscribers.set(roomId, listeners);

  return () => {
    const currentListeners = subscribers.get(roomId);
    if (!currentListeners) {
      return;
    }

    currentListeners.delete(listener);
    if (currentListeners.size === 0) {
      subscribers.delete(roomId);
    }
  };
}
