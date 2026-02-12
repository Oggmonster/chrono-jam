import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mockRounds } from "~/lib/mock-room";

export type GamePhase = "LISTEN" | "GUESS" | "TIMELINE" | "REVEAL" | "INTERMISSION";
export type RoomLifecycle = "lobby" | "running" | "finished";

export type RoomState = {
  roomId: string;
  lifecycle: RoomLifecycle;
  phase: GamePhase;
  roundIndex: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  updatedAt: number;
};

type RoomRole = "host" | "player";

type RoomHookResult = {
  state: RoomState;
  now: number;
  round: (typeof mockRounds)[number];
  remainingMs: number;
  controls: {
    startGame: () => void;
    skipPhase: () => void;
    resetLobby: () => void;
    syncState: () => void;
  };
};

const phaseOrder: GamePhase[] = ["LISTEN", "GUESS", "TIMELINE", "REVEAL", "INTERMISSION"];

const phaseDurationsMs: Record<GamePhase, number> = {
  LISTEN: 15_000,
  GUESS: 20_000,
  TIMELINE: 14_000,
  REVEAL: 8_000,
  INTERMISSION: 5_000,
};

function roomStorageKey(roomId: string) {
  return `chronojam:room:${roomId}`;
}

function roomChannelName(roomId: string) {
  return `chronojam:room:channel:${roomId}`;
}

function nowMs() {
  return Date.now();
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
  return withPhase(state, "LISTEN", 0, at, "running");
}

export function advanceRoomPhase(state: RoomState, at = nowMs()): RoomState {
  if (state.lifecycle !== "running") {
    return state;
  }

  const phaseIndex = phaseOrder.indexOf(state.phase);
  const nextPhase = phaseOrder[(phaseIndex + 1) % phaseOrder.length];

  if (state.phase === "INTERMISSION") {
    const isLastRound = state.roundIndex >= mockRounds.length - 1;
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

function readPersistedState(roomId: string): RoomState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(roomStorageKey(roomId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RoomState;
  } catch {
    return null;
  }
}

function writeState(roomState: RoomState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(roomStorageKey(roomState.roomId), JSON.stringify(roomState));
}

function getActiveRound(state: RoomState) {
  return mockRounds[Math.min(state.roundIndex, mockRounds.length - 1)]!;
}

export function useRoomState(roomId: string, role: RoomRole): RoomHookResult {
  const [state, setState] = useState<RoomState>(() => createLobbyState(roomId));
  const [now, setNow] = useState<number>(() => nowMs());
  const channelRef = useRef<BroadcastChannel | null>(null);

  const commit = useCallback((nextState: RoomState) => {
    writeState(nextState);
    channelRef.current?.postMessage(nextState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const existing = readPersistedState(roomId);
    if (existing) {
      setState(existing);
    } else if (role === "host") {
      const initial = createLobbyState(roomId);
      setState(initial);
      writeState(initial);
    }

    const channel = new BroadcastChannel(roomChannelName(roomId));
    channelRef.current = channel;

    const onMessage = (event: MessageEvent<RoomState>) => {
      setState(event.data);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== roomStorageKey(roomId) || !event.newValue) {
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue) as RoomState;
        setState(parsed);
      } catch {
        // ignore malformed local state
      }
    };

    channel.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);

    return () => {
      channel.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      channel.close();
      channelRef.current = null;
    };
  }, [roomId, role]);

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
        const nextState = tickRoomState(prevState);
        if (nextState !== prevState) {
          commit(nextState);
        }
        return nextState;
      });
    }, 250);

    return () => {
      window.clearInterval(tickTimer);
    };
  }, [commit, role]);

  const controls = useMemo(
    () => ({
      startGame: () => {
        if (role !== "host") {
          return;
        }

        setState((prevState) => {
          const nextState = startRoomGame(prevState);
          commit(nextState);
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
            commit(nextState);
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
        commit(nextState);
      },
      syncState: () => {
        if (role !== "host") {
          return;
        }

        commit(state);
      },
    }),
    [commit, role, roomId, state],
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
