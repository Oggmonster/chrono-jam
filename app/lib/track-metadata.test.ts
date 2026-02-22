import { describe, expect, it } from "vitest";

import { cleanTrackTitle, hasRemasterMarker } from "~/lib/track-metadata";

describe("cleanTrackTitle", () => {
  it("removes common trailing remaster markers", () => {
    expect(cleanTrackTitle("Ironic - 2015 Remaster")).toBe("Ironic");
    expect(cleanTrackTitle("Unfinished Sympathy (2012 Mix/Master)")).toBe("Unfinished Sympathy");
    expect(cleanTrackTitle("One More Time [Remastered 2001]")).toBe("One More Time");
  });

  it("keeps non-remaster suffixes", () => {
    expect(cleanTrackTitle("Tom's Diner - 7\" Version")).toBe("Tom's Diner - 7\" Version");
    expect(cleanTrackTitle("Song Title (Live)")).toBe("Song Title (Live)");
  });
});

describe("hasRemasterMarker", () => {
  it("detects remaster-related markers", () => {
    expect(hasRemasterMarker("Ironic - 2015 Remaster")).toBe(true);
    expect(hasRemasterMarker("Song Name (Remastered 2011)")).toBe(true);
    expect(hasRemasterMarker("Track (Live at Wembley)")).toBe(false);
  });
});

