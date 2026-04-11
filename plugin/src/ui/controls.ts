import { Notice, setIcon } from "obsidian";
import type KokoroTtsPlugin from "../main";

export function registerUiControls(plugin: KokoroTtsPlugin): void {
  const playPauseIcon = plugin.addRibbonIcon("play", "Play note audio or pause/resume", async () => {
    await plugin.togglePauseResume();
  });
  playPauseIcon.addClass("kokoro-tts-ribbon-play");

  const stopIcon = plugin.addRibbonIcon("square", "Stop playback", () => {
    plugin.stopPlayback();
    new Notice("Stopped local TTS playback");
  });
  setIcon(stopIcon, "square");
}
