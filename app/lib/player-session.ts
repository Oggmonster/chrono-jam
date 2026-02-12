export type PlayerSession = {
  id: string;
  name: string;
};

function sessionKey(roomId: string) {
  return `chronojam:player:${roomId}`;
}

export function createPlayerId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function savePlayerSession(roomId: string, session: PlayerSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(sessionKey(roomId), JSON.stringify(session));
}

export function getPlayerSession(roomId: string): PlayerSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(sessionKey(roomId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerSession>;
    if (!parsed.id || !parsed.name) {
      return null;
    }

    return {
      id: parsed.id,
      name: parsed.name,
    };
  } catch {
    return null;
  }
}

