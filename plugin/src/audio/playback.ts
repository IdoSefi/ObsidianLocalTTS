import type { SentenceChunk } from "../types";

export class PlaybackController {
  private audio: HTMLAudioElement | null = null;
  private currentIndex = 0;
  private sentences: SentenceChunk[] = [];

  setSentences(sentences: SentenceChunk[]): void {
    this.sentences = sentences;
    this.currentIndex = 0;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  async playFromSentence(index: number): Promise<void> {
    this.stop();
    this.currentIndex = index;

    const sentence = this.sentences[index];
    if (!sentence?.audioPath && !sentence?.audioUrl) {
      return;
    }

    const src = sentence.audioUrl ?? sentence.audioPath ?? "";
    this.audio = new Audio(src);
    this.audio.onended = () => {
      void this.playNext();
    };
    await this.audio.play();
  }

  async playNext(): Promise<void> {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.sentences.length) {
      this.stop();
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
  }
}
