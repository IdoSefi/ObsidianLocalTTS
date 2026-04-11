import { App, PluginSettingTab, Setting } from "obsidian";
import type KokoroTtsPlugin from "./main";
import type { PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  serverUrl: "http://127.0.0.1:8765",
  backend: "kokoro",
  kokoroVoice: "af_heart",
  piperVoice: "en_US-lessac-high",
  speed: 1.0,
};

export class KokoroTtsSettingTab extends PluginSettingTab {
  plugin: KokoroTtsPlugin;

  constructor(app: App, plugin: KokoroTtsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Server URL")
      .setDesc("Local TTS server base URL (Kokoro/Piper)")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:8765")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Voice")
      .setDesc("Kokoro voice identifier")
      .addText((text) =>
        text.setValue(this.plugin.settings.kokoroVoice).onChange(async (value) => {
          this.plugin.settings.kokoroVoice = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Piper voice")
      .setDesc("Fixed for v1.3: en_US-lessac-high")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.piperVoice)
          .setDisabled(true)
          .setPlaceholder("en_US-lessac-high"),
      );

    new Setting(containerEl)
      .setName("Speed")
      .setDesc("Speech speed multiplier")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.speed)).onChange(async (value) => {
          const parsed = Number(value);
          if (!Number.isNaN(parsed) && parsed > 0) {
            this.plugin.settings.speed = parsed;
            await this.plugin.saveSettings();
          }
        }),
      );
  }
}
