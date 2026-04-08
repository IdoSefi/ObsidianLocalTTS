import type KokoroTtsPlugin from "../main";

export class StatusView {
  private readonly container: HTMLElement;
  private readonly textEl: HTMLSpanElement;
  private readonly sliderEl: HTMLInputElement;
  private onSeek: ((seconds: number) => void) | null = null;

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
    this.sliderEl.style.width = "140px";
    this.sliderEl.style.marginLeft = "8px";
    this.sliderEl.addEventListener("input", () => {
      if (!this.onSeek) {
        return;
      }
      const fraction = Number(this.sliderEl.value) / 1000;
      const duration = Number(this.sliderEl.dataset.duration ?? "0");
      this.onSeek(fraction * duration);
    });
    this.container.appendChild(this.sliderEl);

    this.setIdle();
  }

  setSeekHandler(handler: (seconds: number) => void): void {
    this.onSeek = handler;
  }

  setIdle(): void {
    this.setText("Idle");
    this.setProgress(0, 0);
  }

  setSynthesizing(current: number, total: number): void {
    this.setText(`Synthesizing ${current}/${total}`);
    this.setProgress(0, 0);
  }

  setPlaying(index: number, total: number): void {
    this.setText(`Playing sentence ${index}/${total}`);
  }

  setPaused(index: number, total: number): void {
    this.setText(`Paused sentence ${index}/${total}`);
  }

  setStopped(): void {
    this.setText("Stopped");
  }

  setFailed(message?: string): void {
    this.setText(message ? `Failed: ${message}` : "Failed");
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

  private setText(text: string): void {
    this.textEl.textContent = `Kokoro TTS: ${text}`;
  }
}
