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

interface CacheValidationResult {
  isFullyValid: boolean;
  firstStaleSentenceIndex: number | null;
  validSentenceCount: number;
  noteHashOnlyMismatch: boolean;
}

export default class KokoroTtsPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private readonly playback = new PlaybackController();
  private readonly cache = new VaultAudioCache(this.app);
  private client: KokoroClient | null = null;
  private sentences: SentenceChunk[] = [];
  private sentencesNotePath: string | null = null;
  private isSynthesizing = false;
  private statusView: StatusView | null = null;
  private lastArrowKey: "ArrowLeft" | "ArrowRight" | null = null;
  private lastArrowKeyTs = 0;
  private readonly arrowDoublePressWindowMs = 300;

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
    this.statusView.setPreviousSentenceHandler(() => {
      void this.playPreviousSentence();
    });
    this.statusView.setNextSentenceHandler(() => {
      void this.playNextSentence();
    });
    this.statusView.setPlaybackRateHandler((rate) => {
      this.playback.setPlaybackRate(rate);
      this.statusView?.setPlaybackRate(this.playback.getPlaybackRate());
    });
    this.statusView.setPlaybackRate(this.playback.getPlaybackRate());

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

    this.registerDomEvent(document, "keydown", (event: KeyboardEvent) => {
      void this.handleArrowDoublePress(event);
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

    await this.cache.writeManifest(notePath, this.buildManifest(notePath, prepared.text, this.sentences));

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
      await this.cache.writeManifest(notePath, this.buildManifest(notePath, prepared.text, this.sentences));
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
    const firstReadyIndex = await this.loadSentencesFromCache(notePath, prepared.text, split);
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

    return true;
  }

  async togglePauseResume(): Promise<void> {
    const playbackState = this.playback.getState();

    if (playbackState === "playing") {
      this.playback.pause();
      new Notice("Paused Kokoro TTS playback");
      return;
    }

    if (playbackState === "paused") {
      await this.playback.resume();
      new Notice("Resumed Kokoro TTS playback");
      return;
    }

    await this.playActiveNoteFromCache();
  }

  async playPreviousSentence(): Promise<void> {
    if (!this.isSentenceMovementAllowed()) {
      return;
    }
    const currentIndex = this.playback.getCurrentIndex();
    if (currentIndex <= 0) {
      return;
    }
    await this.playFromSentence(currentIndex - 1, true);
  }

  async playNextSentence(): Promise<void> {
    if (!this.isSentenceMovementAllowed()) {
      return;
    }
    const currentIndex = this.playback.getCurrentIndex();
    if (currentIndex >= this.sentences.length - 1) {
      return;
    }
    await this.playFromSentence(currentIndex + 1, true);
  }

  stopPlayback(): void {
    this.playback.stop();
    this.isSynthesizing = false;
  }

  private isSentenceMovementAllowed(): boolean {
    const playbackState = this.playback.getState();
    return playbackState === "playing" || playbackState === "paused";
  }

  private async handleArrowDoublePress(event: KeyboardEvent): Promise<void> {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      this.lastArrowKey = null;
      this.lastArrowKeyTs = 0;
      return;
    }

    if (!this.isSentenceMovementAllowed()) {
      this.lastArrowKey = event.key;
      this.lastArrowKeyTs = Date.now();
      return;
    }

    const now = Date.now();
    const isDoublePress =
      this.lastArrowKey === event.key && now - this.lastArrowKeyTs <= this.arrowDoublePressWindowMs;
    this.lastArrowKey = event.key;
    this.lastArrowKeyTs = now;

    if (!isDoublePress) {
      return;
    }

    this.lastArrowKey = null;
    this.lastArrowKeyTs = 0;
    if (event.key === "ArrowLeft") {
      await this.playPreviousSentence();
      return;
    }
    await this.playNextSentence();
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

    const firstReadyIndex = await this.loadSentencesFromCache(prepared.notePath, prepared.text, split);
    if (firstReadyIndex < 0) {
      return;
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

  private buildManifest(notePath: string, noteText: string, sentences: SentenceChunk[]): NoteSynthesisManifest {
    return {
      notePath,
      sentenceCount: sentences.length,
      generatedAt: new Date().toISOString(),
      noteTextHash: hashNoteText(noteText),
      sentenceTextHashes: sentences.map((sentence) => hashSentenceText(sentence.text)),
    };
  }

  private async loadSentencesFromCache(
    notePath: string,
    currentNoteText: string,
    split: SentenceChunk[],
  ): Promise<number> {
    if (split.length === 0) {
      new Notice("No readable sentences found in the active note");
      return -1;
    }

    let cached = await this.cache.listExistingSentenceAudio(notePath);
    if (cached.files.length === 0) {
      new Notice("No cached synthesis found. Run 'Synthesize active note' first.");
      return -1;
    }

    let validation = validateCacheAgainstCurrentSentences(currentNoteText, split, cached.manifest);

    if (shouldResynthesizeFromValidation(validation, split.length)) {
      const staleDisplayIndex = (validation.firstStaleSentenceIndex ?? 0) + 1;
      new Notice(`The note changed from sentence ${staleDisplayIndex} onward. Re-synthesizing outdated audio...`);
      await this.resynthesizeInvalidSentences(notePath, currentNoteText, split, validation.firstStaleSentenceIndex ?? 0);
      cached = await this.cache.listExistingSentenceAudio(notePath);
      validation = validateCacheAgainstCurrentSentences(currentNoteText, split, cached.manifest);
    } else if (validation.noteHashOnlyMismatch) {
      console.info("[KokoroTTS] Note-level hash changed but sentence hashes still match; skipping re-synthesis.");
    }

    const filesBySentence = new Map(cached.files.map((item) => [item.sentenceId, item.audioPath]));
    const validPrefixCount = validation.validSentenceCount;

    this.sentences = split.map((sentence) => {
      const audioPath = filesBySentence.get(sentence.id);
      const isSentenceWithinValidPrefix = sentence.id < validPrefixCount;
      const isPlayable = isSentenceWithinValidPrefix && Boolean(audioPath);
      if (!isPlayable) {
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
      if (!validation.isFullyValid || !cached.manifest) {
        new Notice("Cached synthesis is outdated for this note.");
      } else {
        new Notice("Cached synthesis exists but no playable sentence files were found");
      }
      return -1;
    }

    if (!validation.isFullyValid && !validation.noteHashOnlyMismatch) {
      const validCount = validation.validSentenceCount;
      new Notice(
        `The note changed and some sentences could not be regenerated. Playing only the first ${validCount} unchanged sentence${validCount === 1 ? "" : "s"}.`,
      );
    }

    return firstReadyIndex;
  }

  private async resynthesizeInvalidSentences(
    notePath: string,
    currentNoteText: string,
    split: SentenceChunk[],
    staleFromIndex: number,
  ): Promise<void> {
    if (!this.client) {
      new Notice("Kokoro client is not initialized");
      return;
    }

    await this.cache.prepareNoteSynthesisFolder(notePath, false);
    const tempOutputDir = await this.cache.prepareTempSynthesisFolder(notePath, true);
    const sessionId = `note-resynth-${Date.now()}`;
    let regeneratedCount = 0;
    let failedCount = 0;

    try {
      for (let idx = staleFromIndex; idx < split.length; idx += 1) {
        const sentence = split[idx];
        const { response: result } = await this.client.synthesizeSentence({
          sessionId,
          sentenceId: sentence.id,
          text: sentence.text,
          voice: this.settings.voice,
          speed: this.settings.speed,
          outputDir: tempOutputDir,
        });

        if (!result.ok || !result.audioPath) {
          failedCount += 1;
          const reason = result.error ?? "unknown error";
          console.error(`[KokoroTTS] Re-synthesis failed for sentence ${sentence.id + 1}: ${reason}`);
          continue;
        }

        const persistentAudioPath = this.cache.getSentenceAudioAbsolutePath(notePath, sentence.id);
        await fs.mkdir(dirname(persistentAudioPath), { recursive: true });
        await fs.copyFile(result.audioPath, persistentAudioPath);
        regeneratedCount += 1;
      }
    } finally {
      await this.cache.clearTempSynthesisFolder(notePath);
    }

    await this.cache.writeManifest(notePath, this.buildManifest(notePath, currentNoteText, split));

    if (failedCount > 0) {
      new Notice(`Re-synthesized ${regeneratedCount} sentences, but ${failedCount} failed.`);
      return;
    }

    new Notice(`Re-synthesized ${regeneratedCount} updated sentence${regeneratedCount === 1 ? "" : "s"}.`);
  }
}

function validateCacheAgainstCurrentSentences(
  currentNoteText: string,
  currentSentences: SentenceChunk[],
  manifest: NoteSynthesisManifest | null,
): CacheValidationResult {
  if (!manifest) {
    return {
      isFullyValid: false,
      firstStaleSentenceIndex: 0,
      validSentenceCount: 0,
      noteHashOnlyMismatch: false,
    };
  }

  const currentSentenceHashes = currentSentences.map((sentence) => hashSentenceText(sentence.text));
  const currentNoteTextHash = hashNoteText(currentNoteText);
  const cachedSentenceHashes = manifest.sentenceTextHashes ?? [];
  const maxComparableCount = Math.min(currentSentenceHashes.length, cachedSentenceHashes.length);

  let firstMismatchIndex: number | null = null;
  for (let index = 0; index < maxComparableCount; index += 1) {
    if (currentSentenceHashes[index] !== cachedSentenceHashes[index]) {
      firstMismatchIndex = index;
      break;
    }
  }

  if (firstMismatchIndex === null && currentSentenceHashes.length !== cachedSentenceHashes.length) {
    firstMismatchIndex = maxComparableCount;
  }

  const isFullyValid =
    firstMismatchIndex === null &&
    manifest.sentenceCount === currentSentenceHashes.length &&
    manifest.noteTextHash === currentNoteTextHash;

  if (isFullyValid) {
    return {
      isFullyValid: true,
      firstStaleSentenceIndex: null,
      validSentenceCount: currentSentenceHashes.length,
      noteHashOnlyMismatch: false,
    };
  }

  const noteHashOnlyMismatch =
    firstMismatchIndex === null &&
    manifest.sentenceCount === currentSentenceHashes.length &&
    manifest.noteTextHash !== currentNoteTextHash;

  return {
    isFullyValid: false,
    firstStaleSentenceIndex: firstMismatchIndex ?? 0,
    validSentenceCount: firstMismatchIndex ?? 0,
    noteHashOnlyMismatch,
  };
}

function shouldResynthesizeFromValidation(validation: CacheValidationResult, sentenceCount: number): boolean {
  if (validation.firstStaleSentenceIndex !== null) {
    return true;
  }
  return validation.validSentenceCount < sentenceCount;
}

function hashSentenceText(text: string): string {
  return hashString(text);
}

function hashNoteText(text: string): string {
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
