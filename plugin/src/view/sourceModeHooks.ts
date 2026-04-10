import { MarkdownView } from "obsidian";
import type KokoroTtsPlugin from "../main";

export function registerSourceModeHooks(plugin: KokoroTtsPlugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu, _editor, info) => {
      if (!(info instanceof MarkdownView) || info.getMode() !== "source") {
        return;
      }

      menu.addItem((item) => {
        item
          .setTitle("Start reading from here")
          .setIcon("play")
          .onClick(() => {
            void plugin.restartPlaybackFromSourceCursor();
          });
      });
    }),
  );
}
