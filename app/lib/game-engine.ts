import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mockRounds } from "~/lib/mock-room";

export type GamePhase = "LISTEN" | "GUESS" | "TIMELINE" | "REVEAL" | "INTERMISSION";
export type RoomLifecycle = "lobby" | "running" | "finished";
export type RoomParticipant = {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  lastSeenAt: number;
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
};

type RoomRole = "host" | "player";

type RoomCommand =
  | { type: "replace_state"; state: RoomState }
  | { type: "upsert_participant"; participant: Pick<RoomParticipant, "id" | "name"> }
  | { type: "remove_participant"; participantId: string };

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
    upsertParticipant: (participant: Pick<RoomParticipant, "id" | "name">) => void;
    removeParticipant: (participantId: string) => void;
  };
};

const phaseOrder: GamePhase[] = ["LISTEN", "GUESS", "TIMELINE", "REVEAL", "INTERMISSION"];
const participantColors = ["#4ec7e0", "#f28d35", "#e45395", "#7bcf4b", "#7d6cfc", "#ff7f5c"];
const participantStaleMs = 20_000;

const phaseDurationsMs: Record<GamePhase, number> = {
  LISTEN: 15_000,
  GUESS: 20_000,
  TIMELINE: 14_000,
  REVEAL: 8_000,
  INTERMISSION: 5_000,
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

  return (await response.json()) as RoomState;
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

  return (await response.json()) as RoomState;
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
    incoming.participants.length !== current.participants.length
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

function pruneStaleParticipants(roomState: RoomState, at = nowMs()) {
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

function upsertParticipantInState(
  roomState: RoomState,
  participant: Pick<RoomParticipant, "id" | "name">,
  at = nowMs(),
) {
  const normalizedName = participant.name.trim();
  if (!normalizedName) {
    return roomState;
  }

  const existingIndex = roomState.participants.findIndex(({ id }) => id === participant.id);
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
      updatedAt: at,
    };
  }

  return {
    ...roomState,
    participants: [
      ...roomState.participants,
      {
        id: participant.id,
        name: normalizedName,
        color: colorForParticipantIndex(roomState.participants.length),
        joinedAt: at,
        lastSeenAt: at,
      },
    ],
    updatedAt: at,
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
    updatedAt: at,
  };
}

function getActiveRound(state: RoomState) {
  return mockRounds[Math.min(state.roundIndex, mockRounds.length - 1)]!;
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
        const remote = JSON.parse((event as MessageEvent<string>).data) as RoomState;
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
