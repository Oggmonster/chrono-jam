import { describe, expect, it } from "vitest";

import { buildAutocompletePackFromRoundPool, dedupeByNormalizedTitle } from "~/lib/round-pool";

describe("dedupeByNormalizedTitle", () => {
  it("keeps only the first round for duplicate normalized titles", () => {
    const rounds = [
      { trackId: "t1", title: "Drive", artistId: "a1", artist: "The Cars" },
      { trackId: "t2", title: "drive", artistId: "a2", artist: "Incubus" },
      { trackId: "t3", title: "Venus", artistId: "a3", artist: "Shocking Blue" },
    ];

    const deduped = dedupeByNormalizedTitle(rounds, (round) => round.title);
    expect(deduped.map((round) => round.trackId)).toEqual(["t1", "t3"]);
  });
});

describe("buildAutocompletePackFromRoundPool", () => {
  it("builds autocomplete options strictly from the deduped round pool", () => {
    const rounds = [
      { trackId: "t1", title: "Drive", artistId: "a1", artist: "The Cars" },
      { trackId: "t3", title: "Venus", artistId: "a3", artist: "Shocking Blue" },
    ];

    const pack = buildAutocompletePackFromRoundPool(rounds);
    expect(pack.tracks.items.map((item) => item.display)).toEqual(["Drive", "Venus"]);
    expect(pack.artists.items.map((item) => item.display)).toEqual(["The Cars", "Shocking Blue"]);
  });
});
