import { describe, expect, it } from "vitest";

import {
  buildTimelineEntries,
  clampTimelineInsertIndex,
  isTimelineInsertCorrect,
  timelineSlotLabel,
} from "~/lib/timeline";
import { mockRounds } from "~/lib/mock-room";

describe("clampTimelineInsertIndex", () => {
  it("clamps to list bounds and handles non-finite values", () => {
    expect(clampTimelineInsertIndex(-3, 4)).toBe(0);
    expect(clampTimelineInsertIndex(10, 4)).toBe(4);
    expect(clampTimelineInsertIndex(Number.NaN, 4)).toBe(0);
    expect(clampTimelineInsertIndex(2.8, 4)).toBe(2);
  });
});

describe("buildTimelineEntries", () => {
  it("keeps anchors and inserts solved rounds sorted by year", () => {
    const entries = buildTimelineEntries(["r1", "r3"], mockRounds);
    expect(entries.map((entry) => entry.year)).toEqual([1980, 2000, 2017, 2019]);
  });
});

describe("timeline placement helpers", () => {
  it("builds readable slot labels", () => {
    const entries = buildTimelineEntries([], mockRounds);
    expect(timelineSlotLabel(entries, 0)).toBe("Before 1980");
    expect(timelineSlotLabel(entries, 1)).toBe("Between 1980 and 2000");
    expect(timelineSlotLabel(entries, 2)).toBe("After 2000");
  });

  it("validates placement by surrounding year bounds", () => {
    const entries = buildTimelineEntries([], mockRounds);
    expect(isTimelineInsertCorrect(entries, 2019, 2)).toBe(true);
    expect(isTimelineInsertCorrect(entries, 1999, 1)).toBe(true);
    expect(isTimelineInsertCorrect(entries, 1999, 2)).toBe(false);
  });
});
