import { describe, expect, it } from "vitest";

import {
  buildAutocompleteIndex,
  normalizeForAutocomplete,
  searchAutocomplete,
  type AutocompleteEntry,
} from "~/lib/autocomplete";

describe("normalizeForAutocomplete", () => {
  it("strips diacritics, punctuation and collapses whitespace", () => {
    expect(normalizeForAutocomplete("  Bjo\u0308rk - Jo\u0301ga!!  ")).toBe("bjork joga");
  });
});

describe("buildAutocompleteIndex", () => {
  it("deduplicates by id and normalized display", () => {
    const entries: AutocompleteEntry[] = [
      { id: "artist-1", display: "Daft Punk" },
      { id: "artist-1", display: "Daft Punk Duplicate Id" },
      { id: "artist-2", display: "daft  punk" },
      { id: "artist-3", display: "The Weeknd" },
    ];

    const index = buildAutocompleteIndex(entries);
    expect(index.items.map((item) => item.id)).toEqual(["artist-1", "artist-3"]);
  });

  it("keeps duplicate normalized displays when explicitly allowed", () => {
    const entries: AutocompleteEntry[] = [
      { id: "track-1", display: "Drive", detail: "The Cars" },
      { id: "track-2", display: "Drive", detail: "Incubus" },
    ];

    const index = buildAutocompleteIndex(entries, { dedupeNormalizedDisplay: false });
    expect(index.items.map((item) => item.id)).toEqual(["track-1", "track-2"]);
    expect(index.items.map((item) => item.detail)).toEqual(["The Cars", "Incubus"]);
  });
});

describe("searchAutocomplete", () => {
  it("returns ranked suggestions that match all query tokens", () => {
    const entries: AutocompleteEntry[] = [
      { id: "1", display: "Blinding Lights" },
      { id: "2", display: "Lights Out" },
      { id: "3", display: "The Weeknd" },
      { id: "4", display: "Weekday Anthem" },
    ];
    const index = buildAutocompleteIndex(entries);

    const lights = searchAutocomplete(index, "blinding li");
    expect(lights.map((item) => item.id)).toEqual(["1"]);

    const week = searchAutocomplete(index, "week", 8);
    expect(week.map((item) => item.id)).toEqual(["4", "3"]);
  });

  it("returns duplicate title suggestions as separate track options", () => {
    const entries: AutocompleteEntry[] = [
      { id: "track-1", display: "Venus", detail: "Shocking Blue" },
      { id: "track-2", display: "Venus", detail: "Bananarama" },
    ];
    const index = buildAutocompleteIndex(entries, { dedupeNormalizedDisplay: false });

    const suggestions = searchAutocomplete(index, "ven");
    expect(suggestions.map((item) => item.id)).toEqual(["track-2", "track-1"]);
  });
});
