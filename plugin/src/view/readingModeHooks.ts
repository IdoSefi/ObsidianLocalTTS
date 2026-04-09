import { MarkdownView, Notice } from "obsidian";
import type KokoroTtsPlugin from "../main";
import { resolveRenderedClickToTextOffset } from "../sentence/mapping";
import { findNearestSentenceByOffset, findSentenceByOffset } from "../sentence/splitter";

export function registerReadingViewHooks(plugin: KokoroTtsPlugin): void {
  plugin.registerDomEvent(document, "click", async (event) => {
    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      return;
    }

    if (activeView.getMode() !== "preview") {
      return;
    }

    const root = activeView.contentEl;
    const mapping = resolveRenderedClickToTextOffset(root, event.target, event);
    if (mapping.offset === null) {
      console.debug("[KokoroTTS][debug] Click mapping failed: offset was null", {
        target: event.target,
        mode: activeView.getMode(),
      });
      new Notice("debug: click mapping failed (offset null)");
      return;
    }

    const sentences = plugin.getSentences();
    const sentence = findSentenceByOffset(sentences, mapping.offset);
    const resolvedSentence = sentence ?? findNearestSentenceByOffset(sentences, mapping.offset);
    if (!resolvedSentence) {
      console.debug("[KokoroTTS][debug] Click mapped offset but no sentence matched", {
        offset: mapping.offset,
        sentenceCount: sentences.length,
      });
      new Notice(`debug: no sentence for offset ${mapping.offset}`);
      return;
    }

    if (!sentence) {
      console.debug("[KokoroTTS][debug] Using nearest sentence fallback for click offset", {
        offset: mapping.offset,
        sentenceId: resolvedSentence.id,
      });
      new Notice(`debug: nearest sentence fallback for offset ${mapping.offset}`);
    }

    new Notice(`start reading from sentence ${resolvedSentence.id + 1}`);
    await plugin.requestPlaybackFromSentence(resolvedSentence.id);
  });
}
