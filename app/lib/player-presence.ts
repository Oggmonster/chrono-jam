import { useEffect } from "react";

import type { RoomParticipant } from "~/lib/game-engine";

type ParticipantControls = {
  upsertParticipant: (participant: Pick<RoomParticipant, "id" | "name">) => void;
  removeParticipant: (participantId: string) => void;
};

type PlayerSession = {
  id: string;
  name: string;
};

export function usePlayerPresence(
  playerSession: PlayerSession | null,
  controls: ParticipantControls,
  heartbeatMs = 5_000,
) {
  const playerId = playerSession?.id ?? null;
  const playerName = playerSession?.name ?? null;

  useEffect(() => {
    if (!playerId || !playerName) {
      return;
    }

    const heartbeat = () => {
      controls.upsertParticipant({
        id: playerId,
        name: playerName,
      });
    };

    heartbeat();

    const interval = window.setInterval(heartbeat, heartbeatMs);
    const onBeforeUnload = () => {
      controls.removeParticipant(playerId);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [controls, heartbeatMs, playerId, playerName]);
}
