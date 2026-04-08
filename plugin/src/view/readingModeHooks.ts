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
      return;
    }

    const sentence = findSentenceByOffset(plugin.getSentences(), mapping.offset);
    if (!sentence) {
      return;
    }

    const started = await plugin.playFromSentence(sentence.id);
    if (started) {
      new Notice(`Restarted from sentence ${sentence.id + 1}`);
    }
  });
}
