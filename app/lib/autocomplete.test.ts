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
});
