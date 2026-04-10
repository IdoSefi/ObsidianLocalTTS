import { existsSync, readFileSync } from "node:fs";
import type { SentenceChunk } from "../types";

export type PlaybackState = "idle" | "playing" | "paused" | "stopped" | "failed";

export interface PlaybackProgressEvent {
  sentenceIndex: number;
  totalSentences: number;
  currentTime: number;
  duration: number;
}

export interface PlaybackStateEvent {
  state: PlaybackState;
  sentenceIndex: number;
  totalSentences: number;
  message?: string;
}

export interface PlaybackControllerCallbacks {
  onProgress?: (event: PlaybackProgressEvent) => void;
  onStateChange?: (event: PlaybackStateEvent) => void;
}

export class PlaybackController {
  private audio: HTMLAudioElement | null = null;
  private currentIndex = 0;
  private sentences: SentenceChunk[] = [];
  private callbacks: PlaybackControllerCallbacks = {};
  private currentObjectUrl: string | null = null;
  private waitForSentenceReadyHandler: ((sentenceIndex: number, sentence: SentenceChunk) => boolean) | null =
    null;
  private playbackRunId = 0;
  private state: PlaybackState = "idle";
  private playbackRate = 1;

  setSentences(sentences: SentenceChunk[]): void {
    this.sentences = sentences;
    this.currentIndex = 0;
    this.emitState("idle");
  }

  setCallbacks(callbacks: PlaybackControllerCallbacks): void {
    this.callbacks = callbacks;
  }

  setWaitForSentenceReadyHandler(
    handler: ((sentenceIndex: number, sentence: SentenceChunk) => boolean) | null,
  ): void {
    this.waitForSentenceReadyHandler = handler;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  getState(): PlaybackState {
    return this.state;
  }

  setPlaybackRate(rate: number): void {
    const clampedRate = Math.min(Math.max(rate, 0.75), 1.5);
    this.playbackRate = Math.round(clampedRate * 100) / 100;
    if (this.audio) {
      this.audio.playbackRate = this.playbackRate;
    }
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  async playFromSentence(index: number, allowWaitingForPendingSentence = false): Promise<boolean> {
    this.playbackRunId += 1;
    const runId = this.playbackRunId;
    this.stopCurrentAudio(false);
    this.currentIndex = index;

    const sentence = await this.waitForSentence(index, runId, allowWaitingForPendingSentence);
    if (!sentence) {
      this.emitState("failed", "Audio file is missing or not ready for the selected sentence");
      return false;
    }

    return this.playSentence(index, sentence, runId);
  }

  seekTo(seconds: number): void {
    if (!this.audio) {
      return;
    }

    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    if (duration <= 0) {
      return;
    }

    const clamped = Math.min(Math.max(seconds, 0), duration);
    this.audio.currentTime = clamped;
    this.emitProgress();
  }

  pause(): void {
    this.audio?.pause();
  }

  async resume(): Promise<void> {
    if (!this.audio) {
      return;
    }
    await this.audio.play();
  }

  stop(): void {
    this.playbackRunId += 1;
    this.stopCurrentAudio(false);
    this.emitState("stopped");
  }

  private async playNext(runId: number): Promise<void> {
    let nextIndex = this.currentIndex + 1;
    while (nextIndex < this.sentences.length) {
      const sentence = await this.waitForSentence(nextIndex, runId, true);
      if (runId !== this.playbackRunId) {
        return;
      }

      if (!sentence) {
        nextIndex += 1;
        continue;
      }

      const started = await this.playSentence(nextIndex, sentence, runId);
      if (started) {
        return;
      }
      nextIndex += 1;
    }

    this.stopCurrentAudio(false);
    this.emitState("stopped");
  }

  private async waitForSentence(
    sentenceIndex: number,
    runId: number,
    allowWaiting: boolean,
  ): Promise<SentenceChunk | null> {
    while (true) {
      if (runId !== this.playbackRunId) {
        return null;
      }

      const sentence = this.sentences[sentenceIndex];
      if (!sentence) {
        return null;
      }

      if (sentence.audioState === "ready" && (sentence.audioPath || sentence.audioUrl)) {
        return sentence;
      }

      if (sentence.audioState === "error") {
        return null;
      }

      const shouldWait =
        allowWaiting &&
        this.waitForSentenceReadyHandler !== null &&
        this.waitForSentenceReadyHandler(sentenceIndex, sentence);

      if (!shouldWait) {
        return null;
      }

      await sleep(250);
    }
  }

  private async playSentence(sentenceIndex: number, sentence: SentenceChunk, runId: number): Promise<boolean> {
    this.currentIndex = sentenceIndex;
    const source = this.getPlayableSource(sentence);
    if (!source.ok) {
      this.emitState("failed", source.error);
      return false;
    }

    const audio = new Audio(source.src);
    audio.playbackRate = this.playbackRate;
    this.audio = audio;

    audio.addEventListener("loadedmetadata", () => {
      this.emitProgress();
    });
    audio.addEventListener("timeupdate", () => {
      this.emitProgress();
    });
    audio.addEventListener("play", () => {
      this.emitState("playing");
      this.emitProgress();
    });
    audio.addEventListener("pause", () => {
      if (this.audio) {
        this.emitState("paused");
      }
    });
    audio.addEventListener("ended", () => {
      void this.playNext(runId);
    });
    audio.addEventListener("error", () => {
      const errorMessage = audio.error?.message ?? "Unknown audio playback error";
      this.emitState("failed", errorMessage);
      void this.playNext(runId);
    });

    try {
      await audio.play();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitState("failed", message);
      return false;
    }
  }

  private stopCurrentAudio(emitStopped: boolean): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = "";
      this.audio = null;
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    if (emitStopped) {
      this.emitState("stopped");
    }
  }

  private getPlayableSource(sentence: SentenceChunk):
    | { ok: true; src: string }
    | { ok: false; error: string } {
    if (sentence.audioUrl) {
      return { ok: true, src: sentence.audioUrl };
    }

    if (!sentence.audioPath) {
      return { ok: false, error: "Missing audio path" };
    }

    if (!existsSync(sentence.audioPath)) {
      return { ok: false, error: `Audio file does not exist: ${sentence.audioPath}` };
    }

    try {
      const wavBuffer = readFileSync(sentence.audioPath);
      const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
      this.currentObjectUrl = URL.createObjectURL(wavBlob);
      return { ok: true, src: this.currentObjectUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Unable to load WAV for playback: ${message}` };
    }
  }

  private emitProgress(): void {
    if (!this.audio) {
      return;
    }

    const currentTime = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    this.callbacks.onProgress?.({
      sentenceIndex: this.currentIndex,
      totalSentences: this.sentences.length,
      currentTime,
      duration,
    });
  }

  private emitState(state: PlaybackState, message?: string): void {
    this.state = state;
    this.callbacks.onStateChange?.({
      state,
      sentenceIndex: this.currentIndex,
      totalSentences: this.sentences.length,
      message,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
