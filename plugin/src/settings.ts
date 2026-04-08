import { App, PluginSettingTab, Setting } from "obsidian";
import type KokoroTtsPlugin from "./main";
import type { PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  serverUrl: "http://127.0.0.1:8765",
  voice: "af_heart",
  speed: 1.0,
  clearStaleCacheOnStartup: true,
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
      .setDesc("Local Kokoro server base URL")
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
        text.setValue(this.plugin.settings.voice).onChange(async (value) => {
          this.plugin.settings.voice = value.trim();
          await this.plugin.saveSettings();
        }),
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

    new Setting(containerEl)
      .setName("Clear stale cache on startup")
      .setDesc("Remove old temp audio folders from prior runs")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.clearStaleCacheOnStartup).onChange(async (value) => {
          this.plugin.settings.clearStaleCacheOnStartup = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
