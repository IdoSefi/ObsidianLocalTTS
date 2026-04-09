import { MarkdownView, Notice } from "obsidian";
import type KokoroTtsPlugin from "../main";
import { resolveRenderedClickToTextOffset } from "../sentence/mapping";
import { findNearestSentenceByOffset, findSentenceByOffset, splitIntoSentences } from "../sentence/splitter";
import type { SentenceChunk } from "../types";

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

    const renderedText = readRenderedText(root);
    const renderedSentences = splitIntoSentences(renderedText);
    const renderedSentence = findSentenceByOffset(renderedSentences, mapping.offset);
    const resolvedRenderedSentence = renderedSentence ?? findNearestSentenceByOffset(renderedSentences, mapping.offset);
    if (!resolvedRenderedSentence) {
      console.debug("[KokoroTTS][debug] Click offset had no rendered sentence", {
        offset: mapping.offset,
        renderedSentenceCount: renderedSentences.length,
      });
      new Notice(`debug: no rendered sentence for offset ${mapping.offset}`);
      return;
    }

    const pluginSentence = resolvePluginSentence(plugin.getSentences(), resolvedRenderedSentence);
    if (!pluginSentence) {
      console.debug("[KokoroTTS][debug] Could not map rendered sentence to plugin sentence", {
        offset: mapping.offset,
        renderedSentenceId: resolvedRenderedSentence.id,
        renderedSentenceText: resolvedRenderedSentence.text,
      });
      new Notice(`debug: no plugin sentence for offset ${mapping.offset}`);
      return;
    }

    if (!renderedSentence) {
      console.debug("[KokoroTTS][debug] Using nearest rendered sentence fallback for click offset", {
        offset: mapping.offset,
        sentenceId: pluginSentence.id,
      });
      new Notice(`debug: nearest sentence fallback for offset ${mapping.offset}`);
    }

    new Notice(`start reading from sentence ${pluginSentence.id + 1}`);
    await plugin.requestPlaybackFromSentence(pluginSentence.id);
  });
}

function readRenderedText(root: HTMLElement): string {
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    text += walker.currentNode.textContent ?? "";
  }
  return text;
}

function resolvePluginSentence(
  pluginSentences: SentenceChunk[],
  renderedSentence: SentenceChunk,
): SentenceChunk | undefined {
  const byIndex = pluginSentences[renderedSentence.id];
  if (byIndex) {
    return byIndex;
  }

  return pluginSentences.find((sentence) => sentence.text === renderedSentence.text);
}
