import { Notice, setIcon } from "obsidian";
import type KokoroTtsPlugin from "../main";

export function registerUiControls(plugin: KokoroTtsPlugin): void {
  const synthIcon = plugin.addRibbonIcon("audio-lines", "Synthesize active note", async () => {
    await plugin.synthesizeActiveNote();
  });
  synthIcon.addClass("kokoro-tts-ribbon-synthesize");

  const pauseIcon = plugin.addRibbonIcon("pause", "Pause or resume playback", async () => {
    await plugin.togglePauseResume();
  });
  pauseIcon.addClass("kokoro-tts-ribbon-pause");

  const stopIcon = plugin.addRibbonIcon("square", "Stop playback", () => {
    plugin.stopPlayback();
    new Notice("Stopped Kokoro TTS playback");
  });
  setIcon(stopIcon, "square");
}
