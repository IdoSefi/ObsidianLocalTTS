const PATH_OR_FILENAME_REGEX = /(?:[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]+|(?:\.{1,2}[\\/])(?:[^\\/\s]+[\\/])*[^\\/\s]+|\/(?:[^/\s]+\/)*[^/\s]+|[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+)/g;

const MASKED_DOT = "∯";

export function maskPathDotsForSentenceSplit(text: string): string {
  const chars = Array.from(text);

  for (const match of text.matchAll(PATH_OR_FILENAME_REGEX)) {
    const token = match[0];
    const start = match.index ?? -1;
    if (start < 0) {
      continue;
    }

    for (let index = 0; index < token.length; index += 1) {
      if (token[index] !== ".") {
        continue;
      }
      chars[start + index] = MASKED_DOT;
    }
  }

  return chars.join("");
}
