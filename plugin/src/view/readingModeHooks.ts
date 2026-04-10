import { MarkdownView, Notice } from "obsidian";
import type KokoroTtsPlugin from "../main";
import { annotateRenderedSentences } from "../sentence/tagging";

const SENTENCE_ID_SELECTOR = "[data-kokoro-sentence-id]";

export function registerReadingViewHooks(plugin: KokoroTtsPlugin): void {
  plugin.registerMarkdownPostProcessor((element) => {
    annotateRenderedSentences(element, plugin.getSentences());
  });

  plugin.registerDomEvent(document, "click", async (event) => {
    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || activeView.getMode() !== "preview") {
      return;
    }

    const root = activeView.contentEl;
    const targetElement = asElement(event.target);
    if (!targetElement || !root.contains(targetElement)) {
      return;
    }

    const sentenceElement = findSentenceElement(targetElement);
    if (!sentenceElement) {
      annotateRenderedSentences(root, plugin.getSentences());
    }

    const resolvedSentenceElement = sentenceElement ?? findSentenceElement(targetElement);
    if (!resolvedSentenceElement) {
      return;
    }

    const sentenceId = Number(resolvedSentenceElement.getAttribute("data-kokoro-sentence-id"));
    if (!Number.isInteger(sentenceId) || sentenceId < 0) {
      return;
    }

    new Notice(`start reading from sentence ${sentenceId + 1}`);
    await plugin.requestPlaybackFromSentence(sentenceId);
  });
}

function asElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Text) {
    return target.parentElement;
  }
  return null;
}

function findSentenceElement(target: Element): Element | null {
  return target.closest(SENTENCE_ID_SELECTOR);
}
