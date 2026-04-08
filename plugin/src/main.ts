import { MarkdownView, Notice, Plugin } from "obsidian";
import { PlaybackController } from "./audio/playback";
import { TempAudioCache } from "./audio/cache";
import { KokoroClient } from "./audio/kokoroClient";
import { DEFAULT_SETTINGS, KokoroTtsSettingTab } from "./settings";
import { splitIntoSentences } from "./sentence/splitter";
import type { PluginSettings, SentenceChunk } from "./types";
import { registerUiControls } from "./ui/controls";
import { registerReadingViewHooks } from "./view/readingModeHooks";

export default class KokoroTtsPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private readonly playback = new PlaybackController();
  private readonly cache = new TempAudioCache();
  private client: KokoroClient | null = null;
  private sentences: SentenceChunk[] = [];
  private isPaused = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.client = new KokoroClient(this.settings);

    this.addSettingTab(new KokoroTtsSettingTab(this.app, this));
    registerUiControls(this);
    registerReadingViewHooks(this);

    this.addCommand({
      id: "synthesize-active-note",
      name: "Synthesize active note",
      callback: async () => {
        await this.synthesizeActiveNote();
      },
    });

    this.addCommand({
      id: "pause-resume-playback",
      name: "Pause / Resume playback",
      callback: async () => {
        await this.togglePauseResume();
      },
    });

    this.addCommand({
      id: "stop-playback",
      name: "Stop playback",
      callback: () => {
        this.stopPlayback();
      },
    });

    if (this.settings.clearStaleCacheOnStartup) {
      await this.cache.cleanupStaleSessions();
    }
  }

  async onunload(): Promise<void> {
    this.stopPlayback();
    await this.cache.cleanupCurrentSession();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.client = new KokoroClient(this.settings);
  }

  getSentences(): SentenceChunk[] {
    return this.sentences;
  }

  async synthesizeActiveNote(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("No active Markdown note found");
      return;
    }

    if (view.getMode() !== "preview") {
      new Notice("Switch to Reading view before using Kokoro TTS");
      return;
    }

    const text = view.editor?.getValue() ?? view.data;
    if (!text.trim()) {
      new Notice("The active note is empty");
      return;
    }

    this.sentences = splitIntoSentences(text);
    this.playback.setSentences(this.sentences);

    const sessionId = this.cache.startSession();
    if (!this.client) {
      new Notice("Kokoro client is not initialized");
      return;
    }

    const healthy = await this.client.healthcheck();
    if (!healthy) {
      new Notice("Could not reach the local Kokoro server");
      return;
    }

    for (const sentence of this.sentences) {
      sentence.audioState = "generating";
      const result = await this.client.synthesizeSentence({
        sessionId,
        sentenceId: sentence.id,
        text: sentence.text,
        voice: this.settings.voice,
        speed: this.settings.speed,
      });

      if (!result.ok || !result.audioPath) {
        sentence.audioState = "error";
        new Notice(`Failed to synthesize sentence ${sentence.id + 1}`);
        continue;
      }

      sentence.audioPath = result.audioPath;
      sentence.audioState = "ready";
    }

    await this.playFromSentence(0);
  }

  async playFromSentence(index: number): Promise<void> {
    await this.playback.playFromSentence(index);
    this.isPaused = false;
  }

  async togglePauseResume(): Promise<void> {
    if (!this.isPaused) {
      this.playback.pause();
      this.isPaused = true;
      new Notice("Paused Kokoro TTS playback");
      return;
    }

    await this.playback.resume();
    this.isPaused = false;
    new Notice("Resumed Kokoro TTS playback");
  }

  stopPlayback(): void {
    this.playback.stop();
    this.isPaused = false;
  }
}
