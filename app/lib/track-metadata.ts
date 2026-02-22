const whitespacePattern = /\s+/g;

const remasterCorePattern =
  "(?:(?:\\d{4}\\s+)?(?:digital\\s+)?remaster(?:ed)?(?:\\s+\\d{4})?|(?:\\d{4}\\s+)?mix\\s*\\/\\s*master|(?:\\d{4}\\s+)?re[-\\s]?record(?:ed|ing)?)";

const trailingDashPattern = new RegExp(`\\s*-\\s*${remasterCorePattern}\\s*$`, "iu");
const trailingParenPattern = new RegExp(`\\s*\\(${remasterCorePattern}\\)\\s*$`, "iu");
const trailingBracketPattern = new RegExp(`\\s*\\[${remasterCorePattern}\\]\\s*$`, "iu");
const remasterHintPattern = /\b(remaster(?:ed)?|mix\s*\/\s*master|re[-\s]?record(?:ed|ing)?)\b/iu;

function collapseWhitespace(value: string) {
  return value.replace(whitespacePattern, " ").trim();
}

export function cleanTrackTitle(trackTitle: string) {
  const trimmed = collapseWhitespace(trackTitle);
  if (!trimmed) {
    return "";
  }

  let cleaned = trimmed;
  let changed = true;
  while (changed) {
    changed = false;

    const next = cleaned
      .replace(trailingParenPattern, "")
      .replace(trailingBracketPattern, "")
      .replace(trailingDashPattern, "");
    const normalizedNext = collapseWhitespace(next);

    if (normalizedNext !== cleaned) {
      cleaned = normalizedNext;
      changed = true;
    }
  }

  return cleaned || trimmed;
}

export function hasRemasterMarker(trackTitle: string) {
  return remasterHintPattern.test(trackTitle);
}

