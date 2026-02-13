export const gameSongCountPresets = [10, 20, 30, 50] as const;
export const defaultGameSongCount = 20;
export const minGameSongCount = 1;

export function parseGameSongCount(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const parsed = Math.floor(numeric);
  return parsed >= minGameSongCount ? parsed : null;
}

export function clampGameSongCount(
  requestedCount: number | null | undefined,
  maxAvailable: number,
  fallbackCount = defaultGameSongCount,
) {
  const safeMax = Math.max(minGameSongCount, Math.floor(maxAvailable));
  const fallback = parseGameSongCount(fallbackCount) ?? defaultGameSongCount;
  const requested = parseGameSongCount(requestedCount);
  const target = requested ?? fallback;
  return Math.min(safeMax, Math.max(minGameSongCount, target));
}
