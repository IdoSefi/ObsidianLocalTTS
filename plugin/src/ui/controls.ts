import { Notice, setIcon } from "obsidian";
import type KokoroTtsPlugin from "../main";

export function registerUiControls(plugin: KokoroTtsPlugin): void {
  const synthIcon = plugin.addRibbonIcon("audio-lines", "Synthesize active note", async () => {
    await plugin.synthesizeActiveNote();
  });
  synthIcon.addClass("kokoro-tts-ribbon-synthesize");

  const playPauseIcon = plugin.addRibbonIcon("play", "Play cached note audio or pause/resume", async () => {
    await plugin.togglePauseResume();
  });
  playPauseIcon.addClass("kokoro-tts-ribbon-play");

  const stopIcon = plugin.addRibbonIcon("square", "Stop playback", () => {
    plugin.stopPlayback();
    new Notice("Stopped Kokoro TTS playback");
  });
  setIcon(stopIcon, "square");
}
