import type { SentenceChunk } from "../types";

const SENTENCE_ID_ATTR = "data-kokoro-sentence-id";
const SKIP_SELECTOR = [
  "code",
  "pre",
  ".HyperMD-codeblock",
  ".math",
  ".math-inline",
  ".math-block",
  ".katex",
  "mjx-container",
].join(", ");

export function annotateRenderedSentences(root: HTMLElement, sentences: SentenceChunk[]): void {
  if (sentences.length === 0) {
    return;
  }

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof Text) {
      textNodes.push(node);
    }
  }

  const pointer = { sentenceIndex: 0, globalOffset: 0 };
  for (const textNode of textNodes) {
    pointer.globalOffset = annotateTextNode(textNode, sentences, pointer);
  }
}

function annotateTextNode(
  textNode: Text,
  sentences: SentenceChunk[],
  pointer: { sentenceIndex: number; globalOffset: number },
): number {
  const text = textNode.textContent ?? "";
  const length = text.length;
  if (length === 0) {
    return pointer.globalOffset;
  }

  if (shouldSkipTextNode(textNode)) {
    return pointer.globalOffset + length;
  }

  const startOffset = pointer.globalOffset;
  const endOffset = startOffset + length;
  let sentenceIndex = pointer.sentenceIndex;
  while (sentenceIndex < sentences.length && sentences[sentenceIndex].to <= startOffset) {
    sentenceIndex += 1;
  }

  if (sentenceIndex >= sentences.length || sentences[sentenceIndex].from >= endOffset) {
    pointer.sentenceIndex = sentenceIndex;
    return endOffset;
  }

  const fragment = document.createDocumentFragment();
  let localPos = 0;
  let globalPos = startOffset;

  while (localPos < length) {
    while (sentenceIndex < sentences.length && sentences[sentenceIndex].to <= globalPos) {
      sentenceIndex += 1;
    }

    if (sentenceIndex >= sentences.length) {
      fragment.appendChild(document.createTextNode(text.slice(localPos)));
      localPos = length;
      globalPos = endOffset;
      break;
    }

    const sentence = sentences[sentenceIndex];
    if (globalPos < sentence.from) {
      const plainUntil = Math.min(length, sentence.from - startOffset);
      fragment.appendChild(document.createTextNode(text.slice(localPos, plainUntil)));
      localPos = plainUntil;
      globalPos = startOffset + localPos;
      continue;
    }

    const sentenceUntil = Math.min(length, sentence.to - startOffset);
    const span = document.createElement("span");
    span.setAttribute(SENTENCE_ID_ATTR, String(sentence.id));
    span.textContent = text.slice(localPos, sentenceUntil);
    fragment.appendChild(span);
    localPos = sentenceUntil;
    globalPos = startOffset + localPos;
  }

  textNode.replaceWith(fragment);
  pointer.sentenceIndex = sentenceIndex;
  return endOffset;
}

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) {
    return true;
  }
  if (parent.closest(`[${SENTENCE_ID_ATTR}]`)) {
    return true;
  }
  if (parent.closest(SKIP_SELECTOR)) {
    return true;
  }
  return false;
}
