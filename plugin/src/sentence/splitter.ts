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

export function findNearestSentenceByOffset(sentences: SentenceChunk[], offset: number): SentenceChunk | undefined {
  if (sentences.length === 0) {
    return undefined;
  }

  let nearest = sentences[0];
  let nearestDistance = distanceToSentence(offset, nearest);

  for (let index = 1; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const distance = distanceToSentence(offset, sentence);
    if (distance < nearestDistance) {
      nearest = sentence;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function distanceToSentence(offset: number, sentence: SentenceChunk): number {
  if (offset < sentence.from) {
    return sentence.from - offset;
  }
  if (offset >= sentence.to) {
    return offset - sentence.to + 1;
  }
  return 0;
}
