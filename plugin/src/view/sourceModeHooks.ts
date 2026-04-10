import { MarkdownView } from "obsidian";
import type KokoroTtsPlugin from "../main";

export function registerSourceModeHooks(plugin: KokoroTtsPlugin): void {
  let restartTimeout: number | null = null;

  plugin.registerDomEvent(document, "click", () => {
    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || activeView.getMode() !== "source") {
      return;
    }

    if (restartTimeout !== null) {
      window.clearTimeout(restartTimeout);
    }

    restartTimeout = window.setTimeout(() => {
      restartTimeout = null;
      void plugin.restartPlaybackFromSourceCursor();
    }, 0);
  });
}
