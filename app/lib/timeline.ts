export const timelineAnchorYears = [1980, 2000] as const;

export type TimelineRound = {
  id: string;
  title: string;
  year: number;
};

export type TimelineEntry = {
  id: string;
  kind: "anchor" | "round";
  year: number;
  title: string;
};

function anchorEntry(year: number): TimelineEntry {
  return {
    id: `anchor-${year}`,
    kind: "anchor",
    year,
    title: String(year),
  };
}

export function clampTimelineInsertIndex(insertIndex: number, maxIndex: number) {
  if (!Number.isFinite(insertIndex)) {
    return 0;
  }

  return Math.max(0, Math.min(maxIndex, Math.floor(insertIndex)));
}

export function buildTimelineEntries(timelineRoundIds: string[], rounds: TimelineRound[]) {
  const byRoundId = new Map(rounds.map((round) => [round.id, round] as const));
  const roundEntries = timelineRoundIds
    .map((roundId) => byRoundId.get(roundId))
    .filter((round): round is TimelineRound => Boolean(round))
    .map<TimelineEntry>((round) => ({
      id: round.id,
      kind: "round",
      year: round.year,
      title: round.title,
    }));

  const entries = [...timelineAnchorYears.map(anchorEntry), ...roundEntries];
  entries.sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year;
    }

    if (a.kind !== b.kind) {
      return a.kind === "anchor" ? -1 : 1;
    }

    return a.title.localeCompare(b.title);
  });

  return entries;
}

export function timelineEntryLabel(entry: TimelineEntry) {
  return `${entry.year}`;
}

export function timelineSlotLabel(entries: TimelineEntry[], slotIndex: number) {
  const clamped = clampTimelineInsertIndex(slotIndex, entries.length);

  if (clamped === 0) {
    return `Before ${timelineEntryLabel(entries[0]!)}`;
  }

  if (clamped === entries.length) {
    return `After ${timelineEntryLabel(entries[entries.length - 1]!)}`;
  }

  const left = entries[clamped - 1]!;
  const right = entries[clamped]!;
  return `Between ${timelineEntryLabel(left)} and ${timelineEntryLabel(right)}`;
}

export function isTimelineInsertCorrect(entries: TimelineEntry[], year: number, insertIndex: number) {
  const clamped = clampTimelineInsertIndex(insertIndex, entries.length);
  const leftYear = clamped > 0 ? entries[clamped - 1]!.year : Number.NEGATIVE_INFINITY;
  const rightYear = clamped < entries.length ? entries[clamped]!.year : Number.POSITIVE_INFINITY;

  return year >= leftYear && year <= rightYear;
}
