type GamePhase = "LISTEN" | "GUESS" | "TIMELINE" | "REVEAL" | "INTERMISSION";
type RoomLifecycle = "lobby" | "running" | "finished";

type StoredParticipant = {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  lastSeenAt: number;
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

export function createStoredRoomState(roomId: string, at = nowMs()): StoredRoomState {
  return {
    roomId,
    lifecycle: "lobby",
    phase: "LISTEN",
    roundIndex: 0,
    phaseStartedAt: at,
    phaseEndsAt: at,
    updatedAt: at,
    participants: [],
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
  const phase: GamePhase =
    state.phase === "GUESS" ||
    state.phase === "TIMELINE" ||
    state.phase === "REVEAL" ||
    state.phase === "INTERMISSION"
      ? state.phase
      : "LISTEN";

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

  return {
    roomId,
    lifecycle,
    phase,
    roundIndex: Math.max(0, Number(state.roundIndex ?? 0)),
    phaseStartedAt: Number(state.phaseStartedAt ?? at),
    phaseEndsAt: Number(state.phaseEndsAt ?? at),
    updatedAt: Number(state.updatedAt ?? at),
    participants,
  };
}

function pruneStaleParticipants(roomState: StoredRoomState, at = nowMs()): StoredRoomState {
  const nextParticipants = roomState.participants.filter(
    (participant) => at - participant.lastSeenAt <= participantStaleMs,
  );
  if (nextParticipants.length === roomState.participants.length) {
    return roomState;
  }

  return {
    ...roomState,
    participants: nextParticipants,
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
  const normalizedName = participant.name.trim();
  if (!normalizedName) {
    return base;
  }

  const at = nowMs();
  const existingIndex = base.participants.findIndex(({ id }) => id === participant.id);
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

  const nextState = {
    ...base,
    participants: [
      ...base.participants,
      {
        id: participant.id,
        name: normalizedName,
        color: colorForParticipantIndex(base.participants.length),
        joinedAt: at,
        lastSeenAt: at,
      },
    ],
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
