import { buildAutocompleteIndex } from "~/lib/autocomplete";
import { normalizeForAutocomplete } from "~/lib/autocomplete";

type RoundPoolTrack = {
  trackId: string;
  title: string;
  artistId: string;
  artist: string;
};

export function dedupeByNormalizedTitle<T>(items: T[], getTitle: (item: T) => string): T[] {
  const seenTitles = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const normalizedTitle = normalizeForAutocomplete(getTitle(item));
    const key = normalizedTitle || getTitle(item).trim().toLowerCase();
    if (!key || seenTitles.has(key)) {
      continue;
    }

    seenTitles.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function buildAutocompletePackFromRoundPool(rounds: RoundPoolTrack[]) {
  return {
    tracks: buildAutocompleteIndex(
      rounds.map((round) => ({
        id: round.trackId,
        display: round.title,
      })),
    ),
    artists: buildAutocompleteIndex(
      rounds.map((round) => ({
        id: round.artistId,
        display: round.artist,
      })),
    ),
  };
}
