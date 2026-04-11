import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { MarkdownView, Notice, Plugin } from "obsidian";
import { VaultAudioCache } from "./audio/cache";
import { LocalTtsClient } from "./audio/kokoroClient";
import { PlaybackController } from "./audio/playback";
import { DEFAULT_SETTINGS, KokoroTtsSettingTab } from "./settings";
import { normalizeSentenceForSpeech } from "./sentence/normalize";
import { findSentenceByOffset, splitIntoSentences } from "./sentence/splitter";
import type { NoteSynthesisManifest, PluginSettings, SentenceChunk } from "./types";
import { registerUiControls } from "./ui/controls";
import { StatusView } from "./ui/status";
import {
  clearSourcePlaybackHighlight,
  getTrackedSourceEditorViewForNote,
  setSourcePlaybackHighlight,
  sourcePlaybackHighlightExtension,
} from "./view/sourceModeHighlight";
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
  private client: LocalTtsClient | null = null;
  private sentences: SentenceChunk[] = [];
  private sentencesNotePath: string | null = null;
  private isSynthesizing = false;
  private commandRunId = 0;
  private synthesisRunId = 0;
  private statusView: StatusView | null = null;
  private highlightedSourceView: ReturnType<typeof getTrackedSourceEditorViewForNote> | null = null;
  private lastArrowKey: "ArrowLeft" | "ArrowRight" | null = null;
  private lastArrowKeyTs = 0;
  private readonly arrowDoublePressWindowMs = 300;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.normalizeSettingsForBackendScope();
    this.client = new LocalTtsClient(this.settings);

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
      onWaitingForSentence: ({ sentenceIndex, totalSentences }) => {
        new Notice(`Waiting for sentence ${sentenceIndex + 1}/${totalSentences} to finish synthesizing...`);
      },
      onStateChange: ({ state, sentenceIndex, totalSentences, message }) => {
        const oneBasedIndex = sentenceIndex + 1;
        this.syncSourceModePlaybackHighlight(state, sentenceIndex);
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
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.syncSourceModePlaybackHighlight();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.syncSourceModePlaybackHighlight();
      }),
    );

    this.playback.setWaitForSentenceReadyHandler((sentenceIndex, sentence) => {
      if (!this.isSynthesizing) {
        return false;
      }
      return sentence.audioState !== "ready" && sentence.audioState !== "error" && sentenceIndex >= 0;
    });

    this.addSettingTab(new KokoroTtsSettingTab(this.app, this));
    this.registerEditorExtension(sourcePlaybackHighlightExtension);
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

    this.addCommand({
      id: "use-kokoro-backend",
      name: "Use Kokoro TTS backend",
      callback: async () => {
        await this.switchBackend("kokoro");
      },
    });

    this.addCommand({
      id: "use-piper-backend",
      name: "Use Piper TTS backend",
      callback: async () => {
        await this.switchBackend("piper");
      },
    });
  }

  async onunload(): Promise<void> {
    this.stopPlayback();
  }

  async loadSettings(): Promise<void> {
    const loaded = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as PluginSettings & {
      voice?: string;
    };
    if (loaded.voice && !loaded.kokoroVoice) {
      loaded.kokoroVoice = loaded.voice;
    }
    this.settings = loaded;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.client = new LocalTtsClient(this.settings);
  }

  private normalizeSettingsForBackendScope(): void {
    if (!this.settings.kokoroVoice?.trim()) {
      this.settings.kokoroVoice = DEFAULT_SETTINGS.kokoroVoice;
    }
    this.settings.piperVoice = "en_US-lessac-high";
    if (this.settings.backend !== "kokoro" && this.settings.backend !== "piper") {
      this.settings.backend = "kokoro";
    }
  }

  private async switchBackend(backend: PluginSettings["backend"]): Promise<void> {
    if (this.settings.backend === backend) {
      new Notice(`Local TTS backend already set to ${backend === "kokoro" ? "Kokoro" : "Piper"}`);
      return;
    }
    this.settings.backend = backend;
    if (backend === "piper") {
      this.settings.piperVoice = "en_US-lessac-high";
    }
    await this.saveSettings();
    new Notice(`Switched TTS backend to ${backend === "kokoro" ? "Kokoro" : "Piper (en_US-lessac-high)"}`);
  }

  private getActiveBackendVoice(): string {
    return this.settings.backend === "piper" ? this.settings.piperVoice : this.settings.kokoroVoice;
  }

  getSentences(): SentenceChunk[] {
    return this.sentences;
  }

  async synthesizeActiveNote(): Promise<void> {
    const runId = this.beginCommandRun();
    const prepared = this.getPreparedActiveNote();
    if (!prepared || !this.isCommandRunCurrent(runId)) {
      return;
    }

    this.sentences = this.withSpokenText(splitIntoSentences(prepared.text));
    this.sentencesNotePath = prepared.notePath;
    if (this.sentences.length === 0) {
      new Notice("No readable sentences found in the active note");
      return;
    }

    this.cancelPlaybackAndSynthesis(false);
    if (!this.isCommandRunCurrent(runId)) {
      return;
    }
    this.playback.setSentences(this.sentences);

    if (!this.client) {
      new Notice("Local TTS client is not initialized");
      this.statusView?.setFailed("Client not initialized");
      return;
    }

    const total = this.sentences.length;
    const notePath = prepared.notePath;
    const backend = this.settings.backend;
    await this.cache.prepareNoteSynthesisFolder(notePath, backend, true);
    const tempOutputDir = await this.cache.prepareTempSynthesisFolder(notePath, backend, true);
    const sessionId = `note-${Date.now()}`;

    await this.cache.writeManifest(notePath, backend, this.buildManifest(notePath, prepared.text, this.sentences));

    new Notice(`Starting synthesis for ${total} sentences`);
    this.statusView?.setSynthesizing(0, total);

    const health = await this.client.healthcheck();
    if (!health.ok) {
      const healthMessage = health.error ?? (health.status ? `HTTP ${health.status}` : "unknown error");
      this.statusView?.setFailed("Health check failed");
      new Notice(`Local TTS server health check failed: ${healthMessage}`);
      return;
    }

    let readyCount = 0;
    let failedCount = 0;
    let playbackStarted = false;

    const synthesisRunId = this.beginSynthesisRun();

    try {
      for (let idx = 0; idx < this.sentences.length; idx += 1) {
        const sentence = this.sentences[idx];
        sentence.audioState = "generating";
        this.statusView?.setSynthesizing(idx + 1, total);

        const { response: result } = await this.client.synthesizeSentence({
          sessionId,
          sentenceId: sentence.id,
          backend,
          text: sentence.spokenText ?? sentence.text,
          voice: this.getActiveBackendVoice(),
          speed: this.settings.speed,
          outputDir: tempOutputDir,
        });
        if (!this.isSynthesisRunCurrent(synthesisRunId)) {
          return;
        }

        if (!result.ok || !result.audioPath) {
          sentence.audioState = "error";
          failedCount += 1;
          const reason = result.error ?? "unknown error";
          console.error(`[KokoroTTS] Synthesis failed for sentence ${sentence.id + 1}: ${reason}`);
          continue;
        }

        const persistentAudioPath = this.cache.getSentenceAudioAbsolutePath(notePath, backend, sentence.id);
        await fs.mkdir(dirname(persistentAudioPath), { recursive: true });
        await fs.copyFile(result.audioPath, persistentAudioPath);
        if (!this.isSynthesisRunCurrent(synthesisRunId)) {
          return;
        }

        sentence.audioPath = persistentAudioPath;
        sentence.audioState = "ready";
        readyCount += 1;

        if (!playbackStarted) {
          playbackStarted = await this.playFromSentence(sentence.id, true, runId);
          if (!this.isSynthesisRunCurrent(synthesisRunId)) {
            return;
          }
          if (playbackStarted && sentence.id > 0) {
            console.info(
              `[KokoroTTS] Sentence 1 failed/unavailable; started playback from sentence ${sentence.id + 1}`,
            );
          }
        }
      }
    } finally {
      if (this.isSynthesisRunCurrent(synthesisRunId)) {
        this.isSynthesizing = false;
      }
      await this.cache.clearTempSynthesisFolder(notePath, backend);
      if (this.isSynthesisRunCurrent(synthesisRunId)) {
        await this.cache.writeManifest(notePath, backend, this.buildManifest(notePath, prepared.text, this.sentences));
      }
    }

    if (!this.isSynthesisRunCurrent(synthesisRunId)) {
      return;
    }

    new Notice(`Synthesis complete: ${readyCount} ready, ${failedCount} failed`);

    if (!playbackStarted && readyCount > 0) {
      const firstReadyIndex = this.sentences.findIndex((sentence) => sentence.audioState === "ready");
      if (firstReadyIndex >= 0) {
        await this.playFromSentence(firstReadyIndex, false, runId);
      }
    }

    if (readyCount === 0) {
      this.statusView?.setFailed("No sentences ready");
      new Notice("No sentence is ready for playback");
    }
  }

  async playActiveNoteFromCache(): Promise<void> {
    const runId = this.beginCommandRun();
    const prepared = this.getPreparedActiveNote();
    if (!prepared || !this.isCommandRunCurrent(runId)) {
      return;
    }

    const notePath = prepared.notePath;
    const split = this.withSpokenText(splitIntoSentences(prepared.text));
    const firstReadyIndex = await this.loadSentencesFromCache(notePath, prepared.text, split, runId);
    if (!this.isCommandRunCurrent(runId) || firstReadyIndex < 0) {
      return;
    }

    await this.playFromSentence(firstReadyIndex, false, runId);
  }

  async playFromSentence(index: number, allowWaitForReady = false, runId?: number): Promise<boolean> {
    if (runId !== undefined && !this.isCommandRunCurrent(runId)) {
      return false;
    }

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
    if (runId !== undefined && !this.isCommandRunCurrent(runId)) {
      return false;
    }
    if (!started) {
      const isPendingWhileSynthesizing =
        allowWaitForReady && this.isSynthesizing && sentence.audioState !== "ready" && sentence.audioState !== "error";
      if (isPendingWhileSynthesizing) {
        console.info(`[KokoroTTS] Waiting for sentence ${index + 1} audio to become ready...`);
        return false;
      }
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
    const runId = this.beginCommandRun();
    const playbackState = this.playback.getState();

    if (playbackState === "playing") {
      this.playback.pause();
      new Notice("Paused local TTS playback");
      return;
    }

    if (playbackState === "paused") {
      await this.playback.resume();
      new Notice("Resumed local TTS playback");
      return;
    }

    if (!this.isCommandRunCurrent(runId)) {
      return;
    }
    await this.playActiveNoteFromCache();
  }

  async playPreviousSentence(): Promise<void> {
    const runId = this.beginCommandRun();
    if (!this.isSentenceMovementAllowed()) {
      return;
    }
    const currentIndex = this.playback.getCurrentIndex();
    if (currentIndex <= 0) {
      return;
    }
    await this.playFromSentence(currentIndex - 1, true, runId);
  }

  async playNextSentence(): Promise<void> {
    const runId = this.beginCommandRun();
    if (!this.isSentenceMovementAllowed()) {
      return;
    }
    const currentIndex = this.playback.getCurrentIndex();
    if (currentIndex >= this.sentences.length - 1) {
      return;
    }
    await this.playFromSentence(currentIndex + 1, true, runId);
  }

  stopPlayback(): void {
    const wasSynthesizing = this.isSynthesizing;
    this.cancelAllPendingOperations();
    this.statusView?.setStopped();
    if (wasSynthesizing) {
      new Notice("Synthesis stopped");
    }
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
    const runId = this.beginCommandRun();
    const prepared = this.getPreparedActiveNote("source");
    if (!prepared || !this.isCommandRunCurrent(runId)) {
      return;
    }

    const split = this.withSpokenText(splitIntoSentences(prepared.text));
    const sentence = findSentenceByOffset(split, prepared.offset);
    if (!sentence) {
      return;
    }

    const firstReadyIndex = await this.loadSentencesFromCache(prepared.notePath, prepared.text, split, runId);
    if (!this.isCommandRunCurrent(runId) || firstReadyIndex < 0) {
      return;
    }

    const started = await this.playFromSentence(sentence.id, true, runId);
    if (started && this.isCommandRunCurrent(runId)) {
      new Notice(`Restarted from sentence ${sentence.id + 1}`);
    }
  }

  private withSpokenText(sentences: SentenceChunk[]): SentenceChunk[] {
    return sentences.map((sentence) => ({
      ...sentence,
      spokenText: normalizeSentenceForSpeech(sentence.text),
    }));
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
    runId?: number,
  ): Promise<number> {
    if (split.length === 0) {
      new Notice("No readable sentences found in the active note");
      return -1;
    }

    const backend = this.settings.backend;
    let cached = await this.cache.listExistingSentenceAudio(notePath, backend);
    if (runId !== undefined && !this.isCommandRunCurrent(runId)) {
      return -1;
    }
    if (cached.files.length === 0) {
      new Notice("No cached synthesis found. Run 'Synthesize active note' first.");
      return -1;
    }

    let validation = validateCacheAgainstCurrentSentences(currentNoteText, split, cached.manifest);

    if (shouldResynthesizeFromValidation(validation, split.length)) {
      const staleDisplayIndex = (validation.firstStaleSentenceIndex ?? 0) + 1;
      new Notice(`The note changed from sentence ${staleDisplayIndex} onward. Re-synthesizing outdated audio...`);
      await this.resynthesizeInvalidSentences(
        notePath,
        backend,
        currentNoteText,
        split,
        validation.firstStaleSentenceIndex ?? 0,
        runId,
      );
      if (runId !== undefined && !this.isCommandRunCurrent(runId)) {
        return -1;
      }
      cached = await this.cache.listExistingSentenceAudio(notePath, backend);
      if (runId !== undefined && !this.isCommandRunCurrent(runId)) {
        return -1;
      }
      validation = validateCacheAgainstCurrentSentences(currentNoteText, split, cached.manifest);
    } else if (validation.noteHashOnlyMismatch) {
      console.info("[KokoroTTS] Note-level hash changed but sentence hashes still match; skipping re-synthesis.");
    }

    const filesBySentence = new Map(cached.files.map((item) => [item.sentenceId, item.audioPath]));
    const validPrefixCount = validation.validSentenceCount;
    const previousSentenceStateById = new Map(this.sentences.map((sentence) => [sentence.id, sentence]));
    const keepPendingSynthesisState = this.isSynthesizing && this.sentencesNotePath === notePath;

    this.sentences = split.map((sentence) => {
      const audioPath = filesBySentence.get(sentence.id);
      const isSentenceWithinValidPrefix = sentence.id < validPrefixCount;
      const isPlayable = isSentenceWithinValidPrefix && Boolean(audioPath);
      if (!isPlayable) {
        if (keepPendingSynthesisState) {
          const previous = previousSentenceStateById.get(sentence.id);
          if (previous && previous.audioState !== "error") {
            return {
              ...sentence,
              audioPath: previous.audioPath,
              audioState: previous.audioState,
            };
          }
          return {
            ...sentence,
            audioState: "generating" as const,
          };
        }
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
    backend: PluginSettings["backend"],
    currentNoteText: string,
    split: SentenceChunk[],
    staleFromIndex: number,
    runId?: number,
  ): Promise<void> {
    if (!this.client) {
      new Notice("Local TTS client is not initialized");
      return;
    }

    await this.cache.prepareNoteSynthesisFolder(notePath, backend, false);
    const tempOutputDir = await this.cache.prepareTempSynthesisFolder(notePath, backend, true);
    if (runId !== undefined && !this.isCommandRunCurrent(runId)) {
      return;
    }
    const synthesisRunId = this.beginSynthesisRun();
    const sessionId = `note-resynth-${Date.now()}`;
    let regeneratedCount = 0;
    let failedCount = 0;

    try {
      for (let idx = staleFromIndex; idx < split.length; idx += 1) {
        const sentence = split[idx];
        const { response: result } = await this.client.synthesizeSentence({
          sessionId,
          sentenceId: sentence.id,
          backend,
          text: sentence.spokenText ?? sentence.text,
          voice: this.getActiveBackendVoice(),
          speed: this.settings.speed,
          outputDir: tempOutputDir,
        });
        if ((runId !== undefined && !this.isCommandRunCurrent(runId)) || !this.isSynthesisRunCurrent(synthesisRunId)) {
          return;
        }

        if (!result.ok || !result.audioPath) {
          failedCount += 1;
          const reason = result.error ?? "unknown error";
          console.error(`[KokoroTTS] Re-synthesis failed for sentence ${sentence.id + 1}: ${reason}`);
          continue;
        }

        const persistentAudioPath = this.cache.getSentenceAudioAbsolutePath(notePath, backend, sentence.id);
        await fs.mkdir(dirname(persistentAudioPath), { recursive: true });
        await fs.copyFile(result.audioPath, persistentAudioPath);
        if ((runId !== undefined && !this.isCommandRunCurrent(runId)) || !this.isSynthesisRunCurrent(synthesisRunId)) {
          return;
        }
        regeneratedCount += 1;
      }
    } finally {
      if (this.isSynthesisRunCurrent(synthesisRunId)) {
        this.isSynthesizing = false;
      }
      await this.cache.clearTempSynthesisFolder(notePath, backend);
    }

    if ((runId !== undefined && !this.isCommandRunCurrent(runId)) || !this.isSynthesisRunCurrent(synthesisRunId)) {
      return;
    }

    await this.cache.writeManifest(notePath, backend, this.buildManifest(notePath, currentNoteText, split));

    if (failedCount > 0) {
      new Notice(`Re-synthesized ${regeneratedCount} sentences, but ${failedCount} failed.`);
      return;
    }

    new Notice(`Re-synthesized ${regeneratedCount} updated sentence${regeneratedCount === 1 ? "" : "s"}.`);
  }

  private beginCommandRun(): number {
    this.commandRunId += 1;
    return this.commandRunId;
  }

  private isCommandRunCurrent(runId: number): boolean {
    return runId === this.commandRunId;
  }

  private beginSynthesisRun(): number {
    this.synthesisRunId += 1;
    this.isSynthesizing = true;
    return this.synthesisRunId;
  }

  private isSynthesisRunCurrent(runId: number): boolean {
    return runId === this.synthesisRunId;
  }

  private cancelPlaybackAndSynthesis(invalidateCommandRun: boolean): void {
    if (invalidateCommandRun) {
      this.commandRunId += 1;
    }
    this.synthesisRunId += 1;
    this.isSynthesizing = false;
    this.playback.stop();
    this.clearSourcePlaybackHighlightInTrackedView();
  }

  private cancelAllPendingOperations(): void {
    this.cancelPlaybackAndSynthesis(true);
  }

  private syncSourceModePlaybackHighlight(
    explicitState?: "idle" | "playing" | "paused" | "stopped" | "failed",
    explicitSentenceIndex?: number,
  ): void {
    const playbackState = explicitState ?? this.playback.getState();
    if (playbackState === "idle" || playbackState === "stopped" || playbackState === "failed") {
      this.clearSourcePlaybackHighlightInTrackedView();
      return;
    }

    const sentenceIndex = explicitSentenceIndex ?? this.playback.getCurrentIndex();
    if (sentenceIndex < 0 || sentenceIndex >= this.sentences.length) {
      this.clearSourcePlaybackHighlightInTrackedView();
      return;
    }

    const activeMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeNotePath = activeMarkdownView?.file?.path ?? null;
    if (
      !activeMarkdownView ||
      activeMarkdownView.getMode() !== "source" ||
      !this.sentencesNotePath ||
      activeNotePath !== this.sentencesNotePath
    ) {
      this.clearSourcePlaybackHighlightInTrackedView();
      return;
    }

    const sourceEditorView = getTrackedSourceEditorViewForNote(activeNotePath);
    if (!sourceEditorView) {
      this.clearSourcePlaybackHighlightInTrackedView();
      return;
    }

    const sentence = this.sentences[sentenceIndex];
    if (!sentence) {
      this.clearSourcePlaybackHighlightInTrackedView();
      return;
    }

    if (this.highlightedSourceView && this.highlightedSourceView !== sourceEditorView) {
      this.clearSourcePlaybackHighlightInTrackedView();
    }

    setSourcePlaybackHighlight(sourceEditorView, sentence.from, sentence.to);
    this.highlightedSourceView = sourceEditorView;
  }

  private clearSourcePlaybackHighlightInTrackedView(): void {
    if (!this.highlightedSourceView) {
      return;
    }

    clearSourcePlaybackHighlight(this.highlightedSourceView);

    this.highlightedSourceView = null;
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
