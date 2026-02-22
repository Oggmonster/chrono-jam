export type BasePlaylistSelection = {
  scope: "base";
  playlistId: string;
  version: number;
};

export type UserPlaylistSelection = {
  scope: "user";
  ownerSpotifyUserId: string;
  playlistId: string;
  version: number;
};

export type PlaylistSelection = BasePlaylistSelection | UserPlaylistSelection;

const playlistPackIdPattern = /^[A-Za-z0-9-]{1,64}$/u;
const spotifyUserIdPattern = /^[A-Za-z0-9._-]{1,128}$/u;

function parseVersion(value: string) {
  if (!value.startsWith("v")) {
    return null;
  }

  const version = Number.parseInt(value.slice(1), 10);
  if (!Number.isFinite(version) || version < 1) {
    return null;
  }

  return Math.floor(version);
}

export function isValidPlaylistPackId(value: string) {
  const trimmed = value.trim();
  return playlistPackIdPattern.test(trimmed);
}

export function normalizeSpotifyUserIdForStorage(value: string) {
  const trimmed = value.trim();
  return spotifyUserIdPattern.test(trimmed) ? trimmed : null;
}

export function buildBasePlaylistSelectionId(playlistId: string, version: number) {
  if (!isValidPlaylistPackId(playlistId)) {
    throw new Error("Invalid playlist pack id.");
  }
  if (!Number.isFinite(version) || version < 1) {
    throw new Error("Invalid playlist pack version.");
  }

  return `base:${playlistId.trim()}:v${Math.floor(version)}`;
}

export function buildUserPlaylistSelectionId(ownerSpotifyUserId: string, playlistId: string, version: number) {
  const safeOwner = normalizeSpotifyUserIdForStorage(ownerSpotifyUserId);
  if (!safeOwner) {
    throw new Error("Invalid Spotify user id.");
  }

  if (!isValidPlaylistPackId(playlistId)) {
    throw new Error("Invalid playlist pack id.");
  }
  if (!Number.isFinite(version) || version < 1) {
    throw new Error("Invalid playlist pack version.");
  }

  return `user:${safeOwner}:${playlistId.trim()}:v${Math.floor(version)}`;
}

export function parsePlaylistSelectionId(value: string): PlaylistSelection | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split(":");
  if (segments.length === 3 && segments[0] === "base") {
    const playlistId = segments[1]?.trim() ?? "";
    if (!isValidPlaylistPackId(playlistId)) {
      return null;
    }

    const version = parseVersion(segments[2] ?? "");
    if (!version) {
      return null;
    }

    return {
      scope: "base",
      playlistId,
      version,
    };
  }

  if (segments.length === 4 && segments[0] === "user") {
    const ownerSpotifyUserId = normalizeSpotifyUserIdForStorage(segments[1] ?? "");
    if (!ownerSpotifyUserId) {
      return null;
    }

    const playlistId = segments[2]?.trim() ?? "";
    if (!isValidPlaylistPackId(playlistId)) {
      return null;
    }

    const version = parseVersion(segments[3] ?? "");
    if (!version) {
      return null;
    }

    return {
      scope: "user",
      ownerSpotifyUserId,
      playlistId,
      version,
    };
  }

  return null;
}

