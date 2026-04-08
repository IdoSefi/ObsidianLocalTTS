import { MarkdownView, Notice, Plugin } from "obsidian";
import { PlaybackController } from "./audio/playback";
import { TempAudioCache } from "./audio/cache";
import { KokoroClient } from "./audio/kokoroClient";
import { DEFAULT_SETTINGS, KokoroTtsSettingTab } from "./settings";
import { splitIntoSentences } from "./sentence/splitter";
import type { PluginSettings, SentenceChunk } from "./types";
import { registerUiControls } from "./ui/controls";
import { StatusView } from "./ui/status";
import { registerReadingViewHooks } from "./view/readingModeHooks";

export default class KokoroTtsPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private readonly playback = new PlaybackController();
  private readonly cache = new TempAudioCache();
  private client: KokoroClient | null = null;
  private sentences: SentenceChunk[] = [];
  private isPaused = false;
  private statusView: StatusView | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.client = new KokoroClient(this.settings);

    this.statusView = new StatusView(this);
    this.statusView.setSeekHandler((seconds) => {
      this.playback.seekTo(seconds);
    });

    this.playback.setCallbacks({
      onProgress: ({ currentTime, duration }) => {
        this.statusView?.setProgress(currentTime, duration);
      },
      onStateChange: ({ state, sentenceIndex, totalSentences, message }) => {
        const oneBasedIndex = sentenceIndex + 1;
        if (state === "playing") {
          this.statusView?.setPlaying(oneBasedIndex, totalSentences);
          return;
        }
        if (state === "paused") {
          this.statusView?.setPaused(oneBasedIndex, totalSentences);
          return;
        }
        if (state === "stopped") {
          this.statusView?.setStopped();
          return;
        }
        if (state === "failed") {
          this.statusView?.setFailed(message);
        }
      },
    });

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

    this.addCommand({
      id: "show-current-temp-folder",
      name: "Show current Kokoro temp folder",
      callback: () => {
        const folder = this.cache.getSessionFolder();
        if (!folder) {
          new Notice("No active Kokoro temp folder yet. Synthesize first.");
          return;
        }

        console.info(`[KokoroTTS] Current temp folder: ${folder}`);
        new Notice(`Current Kokoro temp folder: ${folder}`);
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
    console.info(`[KokoroTTS] Session temp folder: ${outputDir}`);

    if (!this.client) {
      new Notice("Kokoro client is not initialized");
      this.statusView?.setFailed("Client not initialized");
      return;
    }

    const total = this.sentences.length;
    let readyCount = 0;
    let failedCount = 0;

    new Notice(`Starting synthesis for ${total} sentences`);
    this.statusView?.setSynthesizing(0, total);

    const health = await this.client.healthcheck();
    console.info("[KokoroTTS] /health result", health);
    if (!health.ok) {
      const healthMessage = health.error ?? (health.status ? `HTTP ${health.status}` : "unknown error");
      this.statusView?.setFailed("Health check failed");
      new Notice(`Kokoro server health check failed: ${healthMessage}`);
      return;
    }

    for (let idx = 0; idx < this.sentences.length; idx += 1) {
      const sentence = this.sentences[idx];
      sentence.audioState = "generating";
      this.statusView?.setSynthesizing(idx + 1, total);
      console.info(`[KokoroTTS] Attempting /synthesize for sentence ${sentence.id + 1}/${total}`);

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
        failedCount += 1;
        const reason = result.error ?? "unknown error";
        console.error(`[KokoroTTS] Synthesis failed for sentence ${sentence.id + 1}: ${reason}`);
        new Notice(`Failed to synthesize sentence ${sentence.id + 1}: ${reason}`);
        continue;
      }

      sentence.audioPath = result.audioPath;
      sentence.audioState = "ready";
      readyCount += 1;
    }

    console.info(`[KokoroTTS] WAV files created for session ${sessionId}: ${readyCount}/${total}`);

    if (readyCount === total) {
      new Notice(`Synthesis successful: ${readyCount}/${total} sentences ready`);
    } else if (readyCount > 0) {
      new Notice(`Synthesis partially successful: ${readyCount}/${total} sentences ready`);
    } else {
      new Notice(`Synthesis failed: ${readyCount}/${total} sentences ready`);
      this.statusView?.setFailed();
    }

    if (failedCount > 0) {
      console.warn(`[KokoroTTS] ${failedCount} sentence(s) failed synthesis in this session`);
    }

    const firstReadyIndex = this.sentences.findIndex((sentence) => sentence.audioState === "ready");
    if (firstReadyIndex >= 0) {
      await this.playFromSentence(firstReadyIndex);
      return;
    }

    this.statusView?.setFailed("No sentences ready");
    new Notice("No sentence is ready for playback");
  }

  async playFromSentence(index: number): Promise<boolean> {
    const sentence = this.sentences[index];
    if (!sentence) {
      new Notice("Invalid sentence index for playback");
      this.statusView?.setFailed("Invalid sentence");
      return false;
    }

    if (sentence.audioState !== "ready") {
      new Notice(`Sentence ${index + 1} is not ready for playback`);
      this.statusView?.setFailed("Sentence not ready");
      return false;
    }

    const started = await this.playback.playFromSentence(index);
    this.isPaused = false;

    if (!started) {
      const audioPath = sentence.audioPath ?? "unknown path";
      const message = `Could not start playback for sentence ${index + 1}`;
      console.error(`[KokoroTTS] ${message}. Audio path: ${audioPath}`);
      this.statusView?.setFailed(message);
      new Notice(`${message}. Check console for details.`);
      return false;
    }

    return true;
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
