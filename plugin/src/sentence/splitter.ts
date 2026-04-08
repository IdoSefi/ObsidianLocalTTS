import type { SentenceChunk } from "../types";

const SENTENCE_REGEX = /[^.!?]+[.!?]+|[^.!?]+$/g;

export function splitIntoSentences(text: string): SentenceChunk[] {
  const chunks: SentenceChunk[] = [];
  const matches = text.matchAll(SENTENCE_REGEX);
  let id = 0;

  for (const match of matches) {
    const raw = match[0];
    const start = match.index ?? 0;
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    const leftTrim = raw.search(/\S/);
    const from = start + Math.max(leftTrim, 0);
    const to = from + trimmed.length;

    chunks.push({
      id,
      text: trimmed,
      from,
      to,
      audioState: "idle",
    });

    id += 1;
  }

  return chunks;
}

export function findSentenceByOffset(sentences: SentenceChunk[], offset: number): SentenceChunk | undefined {
  return sentences.find((sentence) => offset >= sentence.from && offset < sentence.to);
}
