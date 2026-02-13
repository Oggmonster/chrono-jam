export type AutocompleteEntry = {
  id: string;
  display: string;
};

export type AutocompleteItem = {
  id: string;
  display: string;
  norm: string;
  tokens: string[];
};

export type AutocompleteIndex = {
  items: AutocompleteItem[];
  prefixIndex: Record<string, number[]>;
};

const collapseWhitespace = /\s+/g;
const nonAlphaNumeric = /[^a-z0-9\s]/g;

export function normalizeForAutocomplete(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(nonAlphaNumeric, " ")
    .replace(collapseWhitespace, " ")
    .trim();
}

function tokenize(value: string) {
  if (!value) {
    return [];
  }

  return value.split(" ").filter(Boolean);
}

function addPrefix(prefixMap: Map<string, Set<number>>, token: string, itemIndex: number) {
  if (token.length < 2) {
    return;
  }

  const two = token.slice(0, 2);
  const three = token.length >= 3 ? token.slice(0, 3) : "";
  const keys = three ? [two, three] : [two];

  for (const key of keys) {
    const existing = prefixMap.get(key);
    if (existing) {
      existing.add(itemIndex);
      continue;
    }

    prefixMap.set(key, new Set([itemIndex]));
  }
}

export function buildAutocompleteIndex(entries: AutocompleteEntry[]): AutocompleteIndex {
  const seenIds = new Set<string>();
  const seenNormDisplays = new Set<string>();
  const items: AutocompleteItem[] = [];

  for (const entry of entries) {
    const id = entry.id.trim();
    const display = entry.display.trim();
    if (!id || !display || seenIds.has(id)) {
      continue;
    }

    const norm = normalizeForAutocomplete(display);
    if (!norm) {
      continue;
    }

    if (seenNormDisplays.has(norm)) {
      continue;
    }

    seenIds.add(id);
    seenNormDisplays.add(norm);
    items.push({
      id,
      display,
      norm,
      tokens: tokenize(norm),
    });
  }

  const prefixMap = new Map<string, Set<number>>();
  items.forEach((item, index) => {
    for (const token of item.tokens) {
      addPrefix(prefixMap, token, index);
    }
  });

  const prefixIndex: Record<string, number[]> = {};
  for (const [prefix, candidateSet] of prefixMap.entries()) {
    prefixIndex[prefix] = [...candidateSet];
  }

  return {
    items,
    prefixIndex,
  };
}

type RankedSuggestion = {
  item: AutocompleteItem;
  rank: number;
};

function queryRank(item: AutocompleteItem, queryNorm: string, queryTokens: string[]) {
  if (!queryTokens.every((token) => item.norm.includes(token))) {
    return -1;
  }

  if (item.norm.startsWith(queryNorm)) {
    return 0;
  }

  if (item.tokens.some((token) => token.startsWith(queryNorm))) {
    return 1;
  }

  if (item.tokens.some((token) => token.includes(queryNorm))) {
    return 2;
  }

  return 3;
}

export function searchAutocomplete(
  index: AutocompleteIndex,
  query: string,
  limit = 8,
  minChars = 2,
): AutocompleteItem[] {
  const queryNorm = normalizeForAutocomplete(query);
  if (queryNorm.length < minChars) {
    return [];
  }

  const queryTokens = tokenize(queryNorm);
  if (queryTokens.length === 0) {
    return [];
  }

  const leadToken = queryTokens[0]!;
  const prefixKey = leadToken.length >= 3 ? leadToken.slice(0, 3) : leadToken.slice(0, 2);
  const candidateIndexes = index.prefixIndex[prefixKey] ?? [];
  const candidatePool =
    candidateIndexes.length > 0
      ? candidateIndexes.map((candidateIndex) => index.items[candidateIndex]!).filter(Boolean)
      : index.items;

  const ranked: RankedSuggestion[] = [];
  for (const item of candidatePool) {
    const rank = queryRank(item, queryNorm, queryTokens);
    if (rank >= 0) {
      ranked.push({ item, rank });
    }
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }

    return a.item.display.localeCompare(b.item.display);
  });

  return ranked.slice(0, limit).map((entry) => entry.item);
}
