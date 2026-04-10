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

interface AudioListeners {
  loadedmetadata: () => void;
  timeupdate: () => void;
  play: () => void;
  pause: () => void;
  ended: () => void;
  error: () => void;
}

interface ActiveAudio {
  element: HTMLAudioElement;
  listeners: AudioListeners;
  runId: number;
  instanceId: number;
  objectUrl: string | null;
}

export class PlaybackController {
  private activeAudio: ActiveAudio | null = null;
  private currentIndex = 0;
  private sentences: SentenceChunk[] = [];
  private callbacks: PlaybackControllerCallbacks = {};
  private waitForSentenceReadyHandler: ((sentenceIndex: number, sentence: SentenceChunk) => boolean) | null =
    null;
  private playbackRunId = 0;
  private audioInstanceCounter = 0;
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
    const clampedRate = Math.min(Math.max(rate, 0.25), 4);
    this.playbackRate = Math.round(clampedRate * 100) / 100;
    if (this.activeAudio) {
      this.activeAudio.element.playbackRate = this.playbackRate;
    }
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  async playFromSentence(index: number, allowWaitingForPendingSentence = false): Promise<boolean> {
    this.playbackRunId += 1;
    const runId = this.playbackRunId;
    this.stopCurrentAudio();
    this.currentIndex = index;

    const sentence = await this.waitForSentence(index, runId, allowWaitingForPendingSentence);
    if (!sentence) {
      if (runId === this.playbackRunId) {
        this.emitState("failed", "Audio file is missing or not ready for the selected sentence");
      }
      return false;
    }

    return this.playSentence(index, sentence, runId);
  }

  seekTo(seconds: number): void {
    if (!this.activeAudio) {
      return;
    }

    const duration = Number.isFinite(this.activeAudio.element.duration) ? this.activeAudio.element.duration : 0;
    if (duration <= 0) {
      return;
    }

    const clamped = Math.min(Math.max(seconds, 0), duration);
    this.activeAudio.element.currentTime = clamped;
    this.emitProgress();
  }

  pause(): void {
    this.activeAudio?.element.pause();
  }

  async resume(): Promise<void> {
    if (!this.activeAudio) {
      return;
    }
    await this.activeAudio.element.play();
  }

  stop(): void {
    this.playbackRunId += 1;
    this.stopCurrentAudio();
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

    this.stopCurrentAudio();
    if (runId === this.playbackRunId) {
      this.emitState("stopped");
    }
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
      if (runId === this.playbackRunId) {
        this.emitState("failed", source.error);
      }
      return false;
    }

    const audio = new Audio(source.src);
    const instanceId = ++this.audioInstanceCounter;

    const listeners: AudioListeners = {
      loadedmetadata: () => {
        if (!this.isActiveAudio(audio, runId, instanceId)) {
          return;
        }
        this.emitProgress();
      },
      timeupdate: () => {
        if (!this.isActiveAudio(audio, runId, instanceId)) {
          return;
        }
        this.emitProgress();
      },
      play: () => {
        if (!this.isActiveAudio(audio, runId, instanceId)) {
          return;
        }
        this.emitState("playing");
        this.emitProgress();
      },
      pause: () => {
        if (!this.isActiveAudio(audio, runId, instanceId)) {
          return;
        }
        this.emitState("paused");
      },
      ended: () => {
        if (!this.isActiveAudio(audio, runId, instanceId)) {
          return;
        }
        void this.playNext(runId);
      },
      error: () => {
        if (!this.isActiveAudio(audio, runId, instanceId)) {
          return;
        }
        const errorMessage = audio.error?.message ?? "Unknown audio playback error";
        this.emitState("failed", errorMessage);
        void this.playNext(runId);
      },
    };

    audio.playbackRate = this.playbackRate;
    audio.addEventListener("loadedmetadata", listeners.loadedmetadata);
    audio.addEventListener("timeupdate", listeners.timeupdate);
    audio.addEventListener("play", listeners.play);
    audio.addEventListener("pause", listeners.pause);
    audio.addEventListener("ended", listeners.ended);
    audio.addEventListener("error", listeners.error);

    this.stopCurrentAudio();
    this.activeAudio = {
      element: audio,
      listeners,
      runId,
      instanceId,
      objectUrl: source.objectUrl,
    };

    try {
      await audio.play();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.isActiveAudio(audio, runId, instanceId)) {
        this.emitState("failed", message);
        this.stopCurrentAudio();
      }
      return false;
    }
  }

  private stopCurrentAudio(): void {
    const activeAudio = this.activeAudio;
    if (!activeAudio) {
      return;
    }

    this.detachAudioListeners(activeAudio);
    activeAudio.element.pause();
    activeAudio.element.currentTime = 0;
    if (activeAudio.objectUrl) {
      URL.revokeObjectURL(activeAudio.objectUrl);
    }
    this.activeAudio = null;
  }

  private detachAudioListeners(activeAudio: ActiveAudio): void {
    activeAudio.element.removeEventListener("loadedmetadata", activeAudio.listeners.loadedmetadata);
    activeAudio.element.removeEventListener("timeupdate", activeAudio.listeners.timeupdate);
    activeAudio.element.removeEventListener("play", activeAudio.listeners.play);
    activeAudio.element.removeEventListener("pause", activeAudio.listeners.pause);
    activeAudio.element.removeEventListener("ended", activeAudio.listeners.ended);
    activeAudio.element.removeEventListener("error", activeAudio.listeners.error);
  }

  private isActiveAudio(audio: HTMLAudioElement, runId: number, instanceId: number): boolean {
    return (
      this.activeAudio !== null &&
      this.activeAudio.element === audio &&
      this.activeAudio.runId === runId &&
      this.activeAudio.instanceId === instanceId &&
      runId === this.playbackRunId
    );
  }

  private getPlayableSource(sentence: SentenceChunk):
    | { ok: true; src: string; objectUrl: string | null }
    | { ok: false; error: string } {
    if (sentence.audioUrl) {
      return { ok: true, src: sentence.audioUrl, objectUrl: null };
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
      const objectUrl = URL.createObjectURL(wavBlob);
      return { ok: true, src: objectUrl, objectUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Unable to load WAV for playback: ${message}` };
    }
  }

  private emitProgress(): void {
    if (!this.activeAudio) {
      return;
    }

    const currentTime = Number.isFinite(this.activeAudio.element.currentTime) ? this.activeAudio.element.currentTime : 0;
    const duration = Number.isFinite(this.activeAudio.element.duration) ? this.activeAudio.element.duration : 0;
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
