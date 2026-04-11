const PATH_OR_FILENAME_REGEX = /(?:[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]+|(?:\.{1,2}[\\/])(?:[^\\/\s]+[\\/])*[^\\/\s]+|\/(?:[^/\s]+\/)*[^/\s]+|[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+)/g;

export function normalizeSentenceForSpeech(rawSentenceText: string): string {
  let normalized = rawSentenceText;

  normalized = normalized
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

  normalized = normalized
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1")
    .replace(/(^|\n)\s{0,3}>\s?/g, "$1")
    .replace(/(^|\n)\s*[-*+]\s+\[(?:\s|x|X)\]\s+/g, "$1")
    .replace(/(^|\n)\s*(?:[-*+]\s+|\d+\.\s+)/g, "$1");

  normalized = normalized
    .replace(/`([^`]+)`/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1");

  normalized = normalized.replace(PATH_OR_FILENAME_REGEX, (pathToken) => basenameForSpeech(pathToken));

  return normalized.replace(/\s+/g, " ").trim();
}

function basenameForSpeech(pathToken: string): string {
  const stripped = pathToken.replace(/[),.;:!?]+$/g, "");
  const trailing = pathToken.slice(stripped.length);
  const parts = stripped.split(/[\\/]/);
  const basename = parts[parts.length - 1] ?? stripped;
  const spokenBase = basename.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return `${spokenBase}${trailing}`;
}
