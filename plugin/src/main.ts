import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { MarkdownView, Notice, Plugin } from "obsidian";
import { VaultAudioCache } from "./audio/cache";
import { KokoroClient } from "./audio/kokoroClient";
import { PlaybackController } from "./audio/playback";
import { DEFAULT_SETTINGS, KokoroTtsSettingTab } from "./settings";
import { findSentenceByOffset, splitIntoSentences } from "./sentence/splitter";
import type { NoteSynthesisManifest, PluginSettings, SentenceChunk } from "./types";
import { registerUiControls } from "./ui/controls";
import { StatusView } from "./ui/status";
import { registerSourceModeHooks } from "./view/sourceModeHooks";

export default class KokoroTtsPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private readonly playback = new PlaybackController();
  private readonly cache = new VaultAudioCache(this.app);
  private client: KokoroClient | null = null;
  private sentences: SentenceChunk[] = [];
  private sentencesNotePath: string | null = null;
  private isPaused = false;
  private isSynthesizing = false;
  private statusView: StatusView | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.client = new KokoroClient(this.settings);

    this.statusView = new StatusView(this);
    this.statusView.setSeekHandler((seconds) => {
      this.playback.seekTo(seconds);
    });

    this.statusView.setPlayPauseHandler(() => {
      void this.togglePauseResume();
    });
    this.statusView.setStopHandler(() => {
      this.stopPlayback();
    });

    this.playback.setCallbacks({
      onProgress: ({ currentTime, duration }) => {
        this.statusView?.setProgress(currentTime, duration);
      },
      onStateChange: ({ state, sentenceIndex, totalSentences, message }) => {
        const oneBasedIndex = sentenceIndex + 1;
        if (state === "playing") {
          this.statusView?.setPlaying(oneBasedIndex, totalSentences);
          this.isPaused = false;
          return;
        }
        if (state === "paused") {
          this.statusView?.setPaused(oneBasedIndex, totalSentences);
          this.isPaused = true;
          return;
        }
        if (state === "stopped") {
          this.statusView?.setStopped();
          this.isPaused = false;
          return;
        }
        if (state === "failed") {
          this.statusView?.setFailed(message);
        }
      },
    });

    this.playback.setWaitForSentenceReadyHandler((sentenceIndex, sentence) => {
      if (!this.isSynthesizing) {
        return false;
      }
      return sentence.audioState !== "ready" && sentence.audioState !== "error" && sentenceIndex >= 0;
    });

    this.addSettingTab(new KokoroTtsSettingTab(this.app, this));
    registerUiControls(this);
    registerSourceModeHooks(this);

    this.addCommand({
      id: "synthesize-active-note",
      name: "Synthesize active note",
      callback: async () => {
        await this.synthesizeActiveNote();
      },
    });

    this.addCommand({
      id: "play-active-note",
      name: "Play active note from cached synthesis",
      callback: async () => {
        await this.playActiveNoteFromCache();
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
  }

  async onunload(): Promise<void> {
    this.stopPlayback();
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
    const prepared = this.getPreparedActiveNote();
    if (!prepared) {
      return;
    }

    this.sentences = splitIntoSentences(prepared.text);
    this.sentencesNotePath = prepared.notePath;
    if (this.sentences.length === 0) {
      new Notice("No readable sentences found in the active note");
      return;
    }

    this.stopPlayback();
    this.playback.setSentences(this.sentences);

    if (!this.client) {
      new Notice("Kokoro client is not initialized");
      this.statusView?.setFailed("Client not initialized");
      return;
    }

    const total = this.sentences.length;
    const notePath = prepared.notePath;
    const folder = await this.cache.prepareNoteSynthesisFolder(notePath, true);
    const tempOutputDir = await this.cache.prepareTempSynthesisFolder(notePath, true);
    const sessionId = `note-${Date.now()}`;

    await this.cache.writeManifest(notePath, this.buildManifest(notePath, this.sentences));

    new Notice(`Starting synthesis for ${total} sentences`);
    this.statusView?.setSynthesizing(0, total);

    const health = await this.client.healthcheck();
    if (!health.ok) {
      const healthMessage = health.error ?? (health.status ? `HTTP ${health.status}` : "unknown error");
      this.statusView?.setFailed("Health check failed");
      new Notice(`Kokoro server health check failed: ${healthMessage}`);
      return;
    }

    let readyCount = 0;
    let failedCount = 0;
    let playbackStarted = false;

    this.isSynthesizing = true;

    try {
      for (let idx = 0; idx < this.sentences.length; idx += 1) {
        const sentence = this.sentences[idx];
        sentence.audioState = "generating";
        this.statusView?.setSynthesizing(idx + 1, total);

        const { response: result } = await this.client.synthesizeSentence({
          sessionId,
          sentenceId: sentence.id,
          text: sentence.text,
          voice: this.settings.voice,
          speed: this.settings.speed,
          outputDir: tempOutputDir,
        });

        if (!result.ok || !result.audioPath) {
          sentence.audioState = "error";
          failedCount += 1;
          const reason = result.error ?? "unknown error";
          console.error(`[KokoroTTS] Synthesis failed for sentence ${sentence.id + 1}: ${reason}`);
          continue;
        }

        const persistentAudioPath = this.cache.getSentenceAudioAbsolutePath(notePath, sentence.id);
        await fs.mkdir(dirname(persistentAudioPath), { recursive: true });
        await fs.copyFile(result.audioPath, persistentAudioPath);

        sentence.audioPath = persistentAudioPath;
        sentence.audioState = "ready";
        readyCount += 1;

        if (!playbackStarted) {
          playbackStarted = await this.playFromSentence(sentence.id, true);
          if (playbackStarted && sentence.id > 0) {
            console.info(
              `[KokoroTTS] Sentence 1 failed/unavailable; started playback from sentence ${sentence.id + 1}`,
            );
          }
        }
      }
    } finally {
      this.isSynthesizing = false;
      await this.cache.clearTempSynthesisFolder(notePath);
      await this.cache.writeManifest(notePath, this.buildManifest(notePath, this.sentences));
    }

    new Notice(`Synthesis complete: ${readyCount} ready, ${failedCount} failed`);

    if (!playbackStarted && readyCount > 0) {
      const firstReadyIndex = this.sentences.findIndex((sentence) => sentence.audioState === "ready");
      if (firstReadyIndex >= 0) {
        await this.playFromSentence(firstReadyIndex);
      }
    }

    if (readyCount === 0) {
      this.statusView?.setFailed("No sentences ready");
      new Notice("No sentence is ready for playback");
    }
  }

  async playActiveNoteFromCache(): Promise<void> {
    const prepared = this.getPreparedActiveNote();
    if (!prepared) {
      return;
    }

    const notePath = prepared.notePath;
    const split = splitIntoSentences(prepared.text);
    const firstReadyIndex = await this.loadSentencesFromCache(notePath, split);
    if (firstReadyIndex < 0) {
      return;
    }

    await this.playFromSentence(firstReadyIndex);
  }

  async playFromSentence(index: number, allowWaitForReady = false): Promise<boolean> {
    const sentence = this.sentences[index];
    if (!sentence) {
      new Notice("Invalid sentence index for playback");
      this.statusView?.setFailed("Invalid sentence");
      return false;
    }

    if (!allowWaitForReady && sentence.audioState !== "ready") {
      new Notice(`Sentence ${index + 1} is not ready for playback`);
      this.statusView?.setFailed("Sentence not ready");
      return false;
    }

    const started = await this.playback.playFromSentence(index, allowWaitForReady);
    if (!started) {
      const audioPath = sentence.audioPath ?? "unknown path";
      const message = `Could not start playback for sentence ${index + 1}`;
      console.error(`[KokoroTTS] ${message}. Audio path: ${audioPath}`);
      this.statusView?.setFailed(message);
      new Notice(`${message}. Check console for details.`);
      return false;
    }

    this.isPaused = false;
    return true;
  }

  async togglePauseResume(): Promise<void> {
    const playbackState = this.playback.getState();

    if (playbackState === "playing") {
      this.playback.pause();
      this.isPaused = true;
      new Notice("Paused Kokoro TTS playback");
      return;
    }

    if (playbackState === "paused" && this.isPaused) {
      await this.playback.resume();
      this.isPaused = false;
      new Notice("Resumed Kokoro TTS playback");
      return;
    }

    await this.playActiveNoteFromCache();
  }

  stopPlayback(): void {
    this.playback.stop();
    this.isPaused = false;
    this.isSynthesizing = false;
  }

  async restartPlaybackFromSourceCursor(): Promise<void> {
    const prepared = this.getPreparedActiveNote("source");
    if (!prepared) {
      return;
    }

    const split = splitIntoSentences(prepared.text);
    const sentence = findSentenceByOffset(split, prepared.offset);
    if (!sentence) {
      return;
    }

    if (this.sentencesNotePath !== prepared.notePath || this.sentences.length === 0) {
      const firstReadyIndex = await this.loadSentencesFromCache(prepared.notePath, split);
      if (firstReadyIndex < 0) {
        return;
      }
    }

    const started = await this.playFromSentence(sentence.id, true);
    if (started) {
      new Notice(`Restarted from sentence ${sentence.id + 1}`);
    }
  }

  private getPreparedActiveNote(
    requiredMode?: "preview" | "source",
  ): { notePath: string; text: string; mode: "preview" | "source"; offset: number } | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("No active Markdown note found");
      return null;
    }

    const mode = view.getMode();
    if (requiredMode && mode !== requiredMode) {
      return null;
    }

    const notePath = view.file?.path;
    if (!notePath) {
      new Notice("Unable to determine active note path");
      return null;
    }

    if (mode === "source") {
      const editor = view.editor;
      if (!editor) {
        new Notice("No active editor found for Source mode");
        return null;
      }

      const text = editor.getValue();
      if (!text.trim()) {
        new Notice("The active note is empty");
        return null;
      }

      const cursor = editor.getCursor();
      const offset = editor.posToOffset(cursor);
      return { notePath, text, mode, offset };
    }

    const text = view.contentEl.innerText ?? view.data;
    if (!text.trim()) {
      new Notice("The active note is empty");
      return null;
    }

    return { notePath, text, mode: "preview", offset: 0 };
  }

  private buildManifest(notePath: string, sentences: SentenceChunk[]): NoteSynthesisManifest {
    return {
      notePath,
      sentenceCount: sentences.length,
      generatedAt: new Date().toISOString(),
      sentenceTextHashes: sentences.map((sentence) => hashSentenceText(sentence.text)),
    };
  }

  private async loadSentencesFromCache(notePath: string, split: SentenceChunk[]): Promise<number> {
    if (split.length === 0) {
      new Notice("No readable sentences found in the active note");
      return -1;
    }

    const cached = await this.cache.listExistingSentenceAudio(notePath);
    if (cached.files.length === 0) {
      new Notice("No cached synthesis found. Run 'Synthesize active note' first.");
      return -1;
    }

    const filesBySentence = new Map(cached.files.map((item) => [item.sentenceId, item.audioPath]));
    this.sentences = split.map((sentence) => {
      const audioPath = filesBySentence.get(sentence.id);
      if (!audioPath) {
        return {
          ...sentence,
          audioState: "error" as const,
        };
      }
      return {
        ...sentence,
        audioPath,
        audioState: "ready" as const,
      };
    });
    this.sentencesNotePath = notePath;
    this.playback.setSentences(this.sentences);

    const firstReadyIndex = this.sentences.findIndex((sentence) => sentence.audioState === "ready");
    if (firstReadyIndex < 0) {
      new Notice("Cached synthesis exists but no playable sentence files were found");
      return -1;
    }

    if (cached.manifest && cached.manifest.sentenceCount !== split.length) {
      new Notice(
        `Cached synthesis sentence count (${cached.manifest.sentenceCount}) differs from current note (${split.length}). Playing available audio only.`,
      );
    }

    return firstReadyIndex;
  }
}

function hashSentenceText(text: string): string {
  return hashString(text);
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
