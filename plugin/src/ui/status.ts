import type KokoroTtsPlugin from "../main";

export class StatusView {
  private readonly container: HTMLElement;
  private readonly textEl: HTMLSpanElement;
  private readonly sliderEl: HTMLInputElement;
  private readonly playPauseButtonEl: HTMLButtonElement;
  private readonly stopButtonEl: HTMLButtonElement;
  private readonly previousButtonEl: HTMLButtonElement;
  private readonly nextButtonEl: HTMLButtonElement;
  private readonly speedButtonEl: HTMLButtonElement;
  private readonly speedPanelEl: HTMLDivElement;
  private readonly speedSliderEl: HTMLInputElement;
  private onSeek: ((seconds: number) => void) | null = null;
  private onPlayPause: (() => void) | null = null;
  private onStop: (() => void) | null = null;
  private onPreviousSentence: (() => void) | null = null;
  private onNextSentence: (() => void) | null = null;
  private onPlaybackRateChange: ((rate: number) => void) | null = null;

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

    this.previousButtonEl = document.createElement("button");
    this.previousButtonEl.type = "button";
    this.previousButtonEl.textContent = "⏮";
    this.previousButtonEl.title = "Previous sentence";
    this.previousButtonEl.addClass("clickable-icon", "kokoro-tts-status-button");
    this.previousButtonEl.addEventListener("click", () => {
      this.onPreviousSentence?.();
    });
    this.container.appendChild(this.previousButtonEl);

    this.nextButtonEl = document.createElement("button");
    this.nextButtonEl.type = "button";
    this.nextButtonEl.textContent = "⏭";
    this.nextButtonEl.title = "Next sentence";
    this.nextButtonEl.addClass("clickable-icon", "kokoro-tts-status-button");
    this.nextButtonEl.addEventListener("click", () => {
      this.onNextSentence?.();
    });
    this.container.appendChild(this.nextButtonEl);

    this.stopButtonEl = document.createElement("button");
    this.stopButtonEl.type = "button";
    this.stopButtonEl.textContent = "■";
    this.stopButtonEl.title = "Stop";
    this.stopButtonEl.addClass("clickable-icon", "kokoro-tts-status-button");
    this.stopButtonEl.addEventListener("click", () => {
      this.onStop?.();
    });
    this.container.appendChild(this.stopButtonEl);

    this.speedButtonEl = document.createElement("button");
    this.speedButtonEl.type = "button";
    this.speedButtonEl.textContent = "1.00x";
    this.speedButtonEl.title = "Playback speed";
    this.speedButtonEl.addClass("clickable-icon", "kokoro-tts-status-speed-button");
    this.speedButtonEl.addEventListener("click", () => {
      this.speedPanelEl.classList.toggle("is-open");
    });
    this.container.appendChild(this.speedButtonEl);

    this.speedPanelEl = document.createElement("div");
    this.speedPanelEl.addClass("kokoro-tts-status-speed-panel");
    this.speedSliderEl = document.createElement("input");
    this.speedSliderEl.type = "range";
    this.speedSliderEl.min = "25";
    this.speedSliderEl.max = "400";
    this.speedSliderEl.step = "5";
    this.speedSliderEl.value = "100";
    this.speedSliderEl.addClass("kokoro-tts-status-speed-slider");
    this.speedSliderEl.addEventListener("input", () => {
      const rate = Number(this.speedSliderEl.value) / 100;
      this.setPlaybackRate(rate);
      this.onPlaybackRateChange?.(rate);
    });
    this.speedPanelEl.appendChild(this.speedSliderEl);
    this.container.appendChild(this.speedPanelEl);

    this.speedPanelEl.addEventListener("focusout", (event) => {
      const nextFocused = event.relatedTarget;
      if (nextFocused instanceof Node && this.speedPanelEl.contains(nextFocused)) {
        return;
      }
      this.speedPanelEl.removeClass("is-open");
    });

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

  setPreviousSentenceHandler(handler: () => void): void {
    this.onPreviousSentence = handler;
  }

  setNextSentenceHandler(handler: () => void): void {
    this.onNextSentence = handler;
  }

  setPlaybackRateHandler(handler: (rate: number) => void): void {
    this.onPlaybackRateChange = handler;
  }

  setPlaybackRate(rate: number): void {
    const rounded = Math.round(rate * 100) / 100;
    this.speedButtonEl.textContent = `${rounded.toFixed(2)}x`;
    this.speedSliderEl.value = String(Math.round(rounded * 100));
  }

  setSentenceMovementEnabled(enabled: boolean): void {
    this.previousButtonEl.disabled = !enabled;
    this.nextButtonEl.disabled = !enabled;
  }

  setIdle(): void {
    this.setText("Idle");
    this.setPlayPauseSymbol("▶");
    this.setProgress(0, 0);
    this.setSentenceMovementEnabled(false);
  }

  setSynthesizing(current: number, total: number): void {
    this.setText(`Synthesizing ${current}/${total}`);
    this.setPlayPauseSymbol("▶");
    this.setProgress(0, 0);
    this.setSentenceMovementEnabled(false);
  }

  setPlaying(index: number, total: number): void {
    this.setText(`Playing sentence ${index}/${total}`);
    this.setPlayPauseSymbol("⏸");
    this.setSentenceMovementEnabled(true);
  }

  setPaused(index: number, total: number): void {
    this.setText(`Paused sentence ${index}/${total}`);
    this.setPlayPauseSymbol("▶");
    this.setSentenceMovementEnabled(true);
  }

  setStopped(): void {
    this.setText("Stopped");
    this.setPlayPauseSymbol("▶");
    this.setSentenceMovementEnabled(false);
  }

  setFailed(message?: string): void {
    this.setText(message ? `Failed: ${message}` : "Failed");
    this.setPlayPauseSymbol("▶");
    this.setProgress(0, 0);
    this.setSentenceMovementEnabled(false);
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
