import { MarkdownView, Notice } from "obsidian";
import type KokoroTtsPlugin from "../main";
import { resolveRenderedClickToTextOffset } from "../sentence/mapping";
import { findSentenceByOffset } from "../sentence/splitter";

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

    const sentence = findSentenceByOffset(plugin.getSentences(), mapping.offset);
    if (!sentence) {
      console.debug("[KokoroTTS][debug] Click mapped offset but no sentence matched", {
        offset: mapping.offset,
        sentenceCount: plugin.getSentences().length,
      });
      new Notice(`debug: no sentence for offset ${mapping.offset}`);
      return;
    }

    new Notice(`start reading from sentence ${sentence.id + 1}`);
    await plugin.requestPlaybackFromSentence(sentence.id);
  });
}
