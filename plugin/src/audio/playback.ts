import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
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

  setSentences(sentences: SentenceChunk[]): void {
    this.sentences = sentences;
    this.currentIndex = 0;
    this.emitState("idle");
  }

  setCallbacks(callbacks: PlaybackControllerCallbacks): void {
    this.callbacks = callbacks;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  async playFromSentence(index: number): Promise<boolean> {
    this.stop();
    this.currentIndex = index;

    const sentence = this.sentences[index];
    if (!sentence?.audioPath && !sentence?.audioUrl) {
      this.emitState("failed", "Audio file is missing for the selected sentence");
      return false;
    }

    if (sentence.audioPath && !existsSync(sentence.audioPath)) {
      this.emitState("failed", `Audio file does not exist: ${sentence.audioPath}`);
      return false;
    }

    const src = sentence.audioUrl ?? (sentence.audioPath ? pathToFileURL(sentence.audioPath).toString() : "");
    if (!src) {
      this.emitState("failed", "Audio source URL is invalid");
      return false;
    }

    this.audio = new Audio(src);
    this.audio.addEventListener("loadedmetadata", () => {
      this.emitProgress();
    });
    this.audio.addEventListener("timeupdate", () => {
      this.emitProgress();
    });
    this.audio.addEventListener("play", () => {
      this.emitState("playing");
      this.emitProgress();
    });
    this.audio.addEventListener("pause", () => {
      if (this.audio) {
        this.emitState("paused");
      }
    });
    this.audio.addEventListener("ended", () => {
      void this.playNext();
    });
    this.audio.addEventListener("error", () => {
      const errorMessage = this.audio?.error?.message ?? "Unknown audio playback error";
      this.emitState("failed", errorMessage);
    });

    try {
      await this.audio.play();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitState("failed", message);
      return false;
    }
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

  async playNext(): Promise<void> {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.sentences.length) {
      this.stop();
      this.emitState("stopped");
      return;
    }
    await this.playFromSentence(nextIndex);
  }

  pause(): void {
    this.audio?.pause();
  }

  async resume(): Promise<void> {
    if (this.audio) {
      await this.audio.play();
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    this.emitState("stopped");
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
    this.callbacks.onStateChange?.({
      state,
      sentenceIndex: this.currentIndex,
      totalSentences: this.sentences.length,
      message,
    });
  }
}
