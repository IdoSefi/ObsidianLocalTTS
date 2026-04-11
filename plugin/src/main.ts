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
      id: "play-active-note",
      name: "Play active note",
      callback: async () => {
        await this.playActiveNote();
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

  async playActiveNote(): Promise<void> {
    const runId = this.beginCommandRun();
    const prepared = this.getPreparedActiveNote();
    if (!prepared || !this.isCommandRunCurrent(runId)) {
      return;
    }

    const notePath = prepared.notePath;
    const split = this.withSpokenText(splitIntoSentences(prepared.text));
    const isReady = await this.ensureSentencesReadyForPlayback(notePath, prepared.text, split, 0, runId);
    if (!this.isCommandRunCurrent(runId) || !isReady) {
      return;
    }

    await this.playFromSentence(0, true, runId);
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
    await this.playActiveNote();
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

    const isReady = await this.ensureSentencesReadyForPlayback(
      prepared.notePath,
      prepared.text,
      split,
      sentence.id,
      runId,
    );
    if (!this.isCommandRunCurrent(runId) || !isReady) {
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

  private async ensureSentencesReadyForPlayback(
    notePath: string,
    currentNoteText: string,
    split: SentenceChunk[],
    startIndex: number,
    runId?: number,
  ): Promise<boolean> {
    if (split.length === 0) {
      new Notice("No readable sentences found in the active note");
      return false;
    }

    if (startIndex < 0 || startIndex >= split.length) {
      new Notice("Invalid sentence index for playback");
      return false;
    }

    const backend = this.settings.backend;
    const cached = await this.cache.listExistingSentenceAudio(notePath, backend);
    if (runId !== undefined && !this.isCommandRunCurrent(runId)) {
      return false;
    }

    const filesBySentence = new Map(cached.files.map((item) => [item.sentenceId, item.audioPath]));
    const staleFromIndex = findFirstStaleSentenceFromIndex(currentNoteText, split, cached.manifest, startIndex);
    const firstMissingAudioIndex = findFirstMissingAudioFromIndex(split, filesBySentence, startIndex);
    const synthFromIndex = minNonNull(staleFromIndex, firstMissingAudioIndex);

    const validPrefixCount = staleFromIndex ?? split.length;
    const previousSentenceStateById = new Map(this.sentences.map((sentence) => [sentence.id, sentence]));
    const keepPendingSynthesisState = this.isSynthesizing && this.sentencesNotePath === notePath;

    this.sentences = split.map((sentence) => {
      const audioPath = filesBySentence.get(sentence.id);
      const isSentenceWithinValidPrefix = sentence.id < validPrefixCount || sentence.id < startIndex;
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

    if (synthFromIndex === null) {
      return this.sentences[startIndex]?.audioState === "ready";
    }

    const shouldAutoplayDuringSynthesis = this.sentences[startIndex]?.audioState !== "ready";
    if (!shouldAutoplayDuringSynthesis) {
      await this.playFromSentence(startIndex, true, runId);
    }

    const reason = staleFromIndex !== null ? "outdated sentence hashes" : "missing sentence audio";
    new Notice(`Preparing note audio from sentence ${synthFromIndex + 1} onward (${reason}).`);
    const playbackStarted = await this.synthesizeSentencesFromIndex(
      notePath,
      backend,
      currentNoteText,
      split,
      synthFromIndex,
      startIndex,
      runId,
    );

    if (runId !== undefined && !this.isCommandRunCurrent(runId)) {
      return false;
    }

    if (!playbackStarted && this.sentences[startIndex]?.audioState === "ready") {
      await this.playFromSentence(startIndex, true, runId);
    }

    return this.sentences[startIndex]?.audioState === "ready";
  }

  private async synthesizeSentencesFromIndex(
    notePath: string,
    backend: PluginSettings["backend"],
    currentNoteText: string,
    split: SentenceChunk[],
    synthFromIndex: number,
    autoplayStartIndex: number,
    runId?: number,
  ): Promise<boolean> {
    if (!this.client) {
      new Notice("Local TTS client is not initialized");
      this.statusView?.setFailed("Client not initialized");
      return false;
    }

    await this.cache.prepareNoteSynthesisFolder(notePath, backend, false);
    const tempOutputDir = await this.cache.prepareTempSynthesisFolder(notePath, backend, true);
    if (runId !== undefined && !this.isCommandRunCurrent(runId)) {
      return false;
    }
    const totalWork = split.length - synthFromIndex;
    this.statusView?.setSynthesizing(0, totalWork);
    const health = await this.client.healthcheck();
    if (!health.ok) {
      const healthMessage = health.error ?? (health.status ? `HTTP ${health.status}` : "unknown error");
      this.statusView?.setFailed("Health check failed");
      new Notice(`Local TTS server health check failed: ${healthMessage}`);
      return false;
    }

    const synthesisRunId = this.beginSynthesisRun();
    const sessionId = `note-resynth-${Date.now()}`;
    let regeneratedCount = 0;
    let failedCount = 0;
    let playbackStarted = false;

    try {
      for (let idx = synthFromIndex; idx < split.length; idx += 1) {
        const sentence = split[idx];
        sentence.audioState = "generating";
        this.statusView?.setSynthesizing(idx - synthFromIndex + 1, totalWork);
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
          return false;
        }

        if (!result.ok || !result.audioPath) {
          sentence.audioState = "error";
          failedCount += 1;
          const reason = result.error ?? "unknown error";
          console.error(`[KokoroTTS] Re-synthesis failed for sentence ${sentence.id + 1}: ${reason}`);
          continue;
        }

        const persistentAudioPath = this.cache.getSentenceAudioAbsolutePath(notePath, backend, sentence.id);
        await fs.mkdir(dirname(persistentAudioPath), { recursive: true });
        await fs.copyFile(result.audioPath, persistentAudioPath);
        if ((runId !== undefined && !this.isCommandRunCurrent(runId)) || !this.isSynthesisRunCurrent(synthesisRunId)) {
          return false;
        }
        sentence.audioPath = persistentAudioPath;
        sentence.audioState = "ready";
        regeneratedCount += 1;

        if (!playbackStarted && sentence.id === autoplayStartIndex) {
          playbackStarted = await this.playFromSentence(autoplayStartIndex, true, runId);
          if (!this.isSynthesisRunCurrent(synthesisRunId)) {
            return playbackStarted;
          }
        }
      }
    } finally {
      if (this.isSynthesisRunCurrent(synthesisRunId)) {
        this.isSynthesizing = false;
      }
      await this.cache.clearTempSynthesisFolder(notePath, backend);
    }

    if ((runId !== undefined && !this.isCommandRunCurrent(runId)) || !this.isSynthesisRunCurrent(synthesisRunId)) {
      return playbackStarted;
    }

    await this.cache.writeManifest(notePath, backend, this.buildManifest(notePath, currentNoteText, split));

    if (failedCount > 0) {
      new Notice(`Re-synthesized ${regeneratedCount} sentences, but ${failedCount} failed.`);
      return playbackStarted;
    }

    new Notice(`Re-synthesized ${regeneratedCount} updated sentence${regeneratedCount === 1 ? "" : "s"}.`);
    return playbackStarted;
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

function findFirstStaleSentenceFromIndex(
  currentNoteText: string,
  currentSentences: SentenceChunk[],
  manifest: NoteSynthesisManifest | null,
  startIndex: number,
): number | null {
  if (!manifest) {
    return startIndex;
  }

  const currentSentenceHashes = currentSentences.map((sentence) => hashSentenceText(sentence.text));
  const cachedSentenceHashes = manifest.sentenceTextHashes ?? [];

  for (let index = startIndex; index < currentSentenceHashes.length; index += 1) {
    if (cachedSentenceHashes[index] !== currentSentenceHashes[index]) {
      return index;
    }
  }

  if (manifest.sentenceCount !== currentSentenceHashes.length) {
    return startIndex;
  }

  if (manifest.noteTextHash !== hashNoteText(currentNoteText)) {
    console.info(
      "[KokoroTTS] Note-level hash changed but sentence hashes match for requested playback range; reusing cache.",
    );
  }

  return null;
}

function findFirstMissingAudioFromIndex(
  sentences: SentenceChunk[],
  filesBySentence: Map<number, string>,
  startIndex: number,
): number | null {
  for (let index = startIndex; index < sentences.length; index += 1) {
    if (!filesBySentence.get(index)) {
      return index;
    }
  }

  return null;
}

function minNonNull(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.min(left, right);
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
