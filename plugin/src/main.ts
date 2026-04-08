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

    const text = view.contentEl.innerText ?? view.data;
    if (!text.trim()) {
      new Notice("The active note is empty");
      return;
    }

    this.sentences = splitIntoSentences(text);
    if (this.sentences.length === 0) {
      new Notice("No readable sentences found in the active note");
      return;
    }
    this.playback.setSentences(this.sentences);

    this.stopPlayback();
    await this.cache.cleanupCurrentSession();
    const sessionId = await this.cache.startSession();
    const outputDir = this.cache.getSessionFolder();
    if (!this.client) {
      new Notice("Kokoro client is not initialized");
      return;
    }

    const health = await this.client.healthcheck();
    console.info("[KokoroTTS] /health result", health);
    if (!health.ok) {
      const healthMessage = health.error ?? (health.status ? `HTTP ${health.status}` : "unknown error");
      new Notice(`Kokoro server health check failed: ${healthMessage}`);
      return;
    }

    for (const sentence of this.sentences) {
      sentence.audioState = "generating";
      console.info(`[KokoroTTS] Attempting /synthesize for sentence ${sentence.id + 1}`);
      const { response: result, transportError, attempted } = await this.client.synthesizeSentence({
        sessionId,
        sentenceId: sentence.id,
        text: sentence.text,
        voice: this.settings.voice,
        speed: this.settings.speed,
        outputDir,
      });

      console.info(`[KokoroTTS] /synthesize attempted=${attempted} sentence=${sentence.id + 1}`);
      if (transportError) {
        console.error(`[KokoroTTS] Transport error for sentence ${sentence.id + 1}: ${transportError}`);
      }

      if (!result.ok || !result.audioPath) {
        sentence.audioState = "error";
        const reason = result.error ?? "unknown error";
        console.error(`[KokoroTTS] Synthesis failed for sentence ${sentence.id + 1}: ${reason}`);
        new Notice(`Failed to synthesize sentence ${sentence.id + 1}: ${reason}`);
        continue;
      }

      sentence.audioPath = result.audioPath;
      sentence.audioState = "ready";
    }

    const firstReadyIndex = this.sentences.findIndex((sentence) => sentence.audioState === "ready");
    if (firstReadyIndex >= 0) {
      await this.playFromSentence(firstReadyIndex);
      return;
    }

    new Notice("Synthesis failed for all sentences");
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
