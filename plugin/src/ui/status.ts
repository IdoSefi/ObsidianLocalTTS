import type KokoroTtsPlugin from "../main";

export class StatusView {
  private readonly container: HTMLElement;
  private readonly textEl: HTMLSpanElement;
  private readonly sliderEl: HTMLInputElement;
  private readonly playPauseButtonEl: HTMLButtonElement;
  private readonly stopButtonEl: HTMLButtonElement;
  private onSeek: ((seconds: number) => void) | null = null;
  private onPlayPause: (() => void) | null = null;
  private onStop: (() => void) | null = null;

  constructor(plugin: KokoroTtsPlugin) {
    this.container = plugin.addStatusBarItem();
    this.container.addClass("kokoro-tts-status");

    this.textEl = document.createElement("span");
    this.textEl.addClass("kokoro-tts-status-text");
    this.container.appendChild(this.textEl);

    this.sliderEl = document.createElement("input");
    this.sliderEl.type = "range";
    this.sliderEl.min = "0";
    this.sliderEl.max = "1000";
    this.sliderEl.value = "0";
    this.sliderEl.disabled = true;
    this.sliderEl.addClass("kokoro-tts-status-slider");
    this.sliderEl.addEventListener("input", () => {
      if (!this.onSeek) {
        return;
      }
      const fraction = Number(this.sliderEl.value) / 1000;
      const duration = Number(this.sliderEl.dataset.duration ?? "0");
      this.onSeek(fraction * duration);
    });
    this.container.appendChild(this.sliderEl);

    this.playPauseButtonEl = document.createElement("button");
    this.playPauseButtonEl.type = "button";
    this.playPauseButtonEl.textContent = "▶";
    this.playPauseButtonEl.title = "Play/Pause";
    this.playPauseButtonEl.addClass("clickable-icon", "kokoro-tts-status-button");
    this.playPauseButtonEl.addEventListener("click", () => {
      this.onPlayPause?.();
    });
    this.container.appendChild(this.playPauseButtonEl);

    this.stopButtonEl = document.createElement("button");
    this.stopButtonEl.type = "button";
    this.stopButtonEl.textContent = "■";
    this.stopButtonEl.title = "Stop";
    this.stopButtonEl.addClass("clickable-icon", "kokoro-tts-status-button");
    this.stopButtonEl.addEventListener("click", () => {
      this.onStop?.();
    });
    this.container.appendChild(this.stopButtonEl);

    this.setIdle();
  }

  setSeekHandler(handler: (seconds: number) => void): void {
    this.onSeek = handler;
  }

  setPlayPauseHandler(handler: () => void): void {
    this.onPlayPause = handler;
  }

  setStopHandler(handler: () => void): void {
    this.onStop = handler;
  }

  setIdle(): void {
    this.setText("Idle");
    this.setPlayPauseSymbol("▶");
    this.setProgress(0, 0);
  }

  setSynthesizing(current: number, total: number): void {
    this.setText(`Synthesizing ${current}/${total}`);
    this.setPlayPauseSymbol("▶");
    this.setProgress(0, 0);
  }

  setWaitingForSentence(index: number): void {
    this.setText(`Waiting for sentence ${index}`);
    this.setPlayPauseSymbol("▶");
    this.setProgress(0, 0);
  }

  setPlaying(index: number, total: number): void {
    this.setText(`Playing sentence ${index}/${total}`);
    this.setPlayPauseSymbol("⏸");
  }

  setPaused(index: number, total: number): void {
    this.setText(`Paused sentence ${index}/${total}`);
    this.setPlayPauseSymbol("▶");
  }

  setStopped(): void {
    this.setText("Stopped");
    this.setPlayPauseSymbol("▶");
  }

  setFailed(message?: string): void {
    this.setText(message ? `Failed: ${message}` : "Failed");
    this.setPlayPauseSymbol("▶");
    this.setProgress(0, 0);
  }

  setProgress(currentTime: number, duration: number): void {
    if (!Number.isFinite(duration) || duration <= 0) {
      this.sliderEl.disabled = true;
      this.sliderEl.value = "0";
      this.sliderEl.dataset.duration = "0";
      return;
    }

    const safeCurrent = Math.min(Math.max(currentTime, 0), duration);
    this.sliderEl.disabled = false;
    this.sliderEl.dataset.duration = String(duration);
    this.sliderEl.value = String(Math.round((safeCurrent / duration) * 1000));
  }

  private setPlayPauseSymbol(symbol: string): void {
    this.playPauseButtonEl.textContent = symbol;
  }

  private setText(text: string): void {
    this.textEl.textContent = `Kokoro TTS: ${text}`;
  }
}
