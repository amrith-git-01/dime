export type ProseToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "number"; value: string }
  | { type: "bold_number"; value: string };

const BOLD_PATTERN = /\*\*(.+?)\*\*/;
/** ₹ amounts, percentages, and grouped numerics (e.g. 26,644). */
const NUMBER_PATTERN =
  /(₹[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)+)/g;

function splitNumbers(segment: string): ProseToken[] {
  const tokens: ProseToken[] = [];
  let lastIndex = 0;

  for (const match of segment.matchAll(NUMBER_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ type: "text", value: segment.slice(lastIndex, index) });
    }
    tokens.push({ type: "number", value: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < segment.length) {
    tokens.push({ type: "text", value: segment.slice(lastIndex) });
  }

  return tokens;
}

function boldTokens(inner: string): ProseToken[] {
  return splitNumbers(inner).map((token) => {
    if (token.type === "number") {
      return { type: "bold_number" as const, value: token.value };
    }
    return { type: "bold" as const, value: token.value };
  });
}

/**
 * Lightweight inline markup for agent chat prose:
 * - `**bold**` → semibold
 * - currency / numeric tokens → highlighted in the renderer
 */
export function parseAgentProse(input: string): ProseToken[] {
  const tokens: ProseToken[] = [];
  let remaining = input;

  while (remaining.length > 0) {
    const match = remaining.match(BOLD_PATTERN);
    if (!match || match.index === undefined) {
      tokens.push(...splitNumbers(remaining));
      break;
    }

    if (match.index > 0) {
      tokens.push(...splitNumbers(remaining.slice(0, match.index)));
    }

    tokens.push(...boldTokens(match[1]));
    remaining = remaining.slice(match.index + match[0].length);
  }

  return tokens;
}
